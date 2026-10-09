import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import type { Candle } from '../data/types';
import { DatasetRepository, IndexedDbBackend } from './datasets';
import type { DatasetBackend, DatasetEnvelope } from './datasets';

function backend(): DatasetBackend {
  let value: DatasetEnvelope | null = null;
  return {
    read: async () => value,
    write: async (next) => {
      value = structuredClone(next);
    },
  };
}
describe('dataset persistence', () => {
  it('restores validated datasets and active selection across actual IndexedDB connections', async () => {
    const database = new IndexedDbBackend(new IDBFactory(), 'test-library');
    const first = new DatasetRepository(database);
    await first.save(fixtureDataset());
    const restored = await new DatasetRepository(database).initialize();
    expect(restored.persistent).toBe(true);
    expect(restored.selectedId).toBe('import:fixture:daily');
    expect(restored.datasets).toEqual([fixtureDataset()]);
    await first.clear();
    expect(
      (await new DatasetRepository(database).initialize()).datasets,
    ).toEqual([]);
  });
  it('keeps session-only use after storage denial or quota failure, and accurately warns about durable leftovers', async () => {
    for (const failsRead of [true, false]) {
      const denied: DatasetBackend = {
        read: async () => {
          if (failsRead) throw new Error('denied');
          return null;
        },
        write: async () => {
          throw new DOMException('quota fixture', 'QuotaExceededError');
        },
      };
      const store = new DatasetRepository(denied);
      const snapshot = await store.save(fixtureDataset());
      expect(snapshot.datasets).toHaveLength(1);
      expect(snapshot.persistent).toBe(false);
      expect(snapshot.warning).toContain('Previously saved data may reappear');
      expect((await store.clear()).datasets).toHaveLength(0);
    }
  });
  it('bounds recent datasets and evicts the oldest, while serialized commands retain the right selection', async () => {
    const store = new DatasetRepository(backend());
    await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        store.save(fixtureDataset(undefined, 'item' + i)),
      ),
    );
    expect(store.snapshot().datasets).toHaveLength(10);
    expect(
      store
        .snapshot()
        .datasets.some((item) => item.metadata.id === 'import:item0:daily'),
    ).toBe(false);
    await store.select('import:item3:daily');
    await store.delete('import:item4:daily');
    expect(store.snapshot().selectedId).toBe('import:item3:daily');
    await store.delete('import:item3:daily');
    expect(store.snapshot().selectedId).toBeNull();
  });
  it('projects stored data, skips corrupt records and rejects live persistence until terms are implemented', async () => {
    const valid = fixtureDataset();
    const saved: DatasetBackend = {
      read: async () => ({
        version: 1,
        datasets: [{ ...valid, apiKey: 'secret' }, { broken: true }],
        selectedId: valid.metadata.id,
      }),
      write: async () => {},
    };
    const result = await new DatasetRepository(saved).initialize();
    expect(result.datasets).toEqual([valid]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.warning).toContain('invalid');
    const live = {
      ...valid,
      metadata: {
        ...valid.metadata,
        mode: 'live' as const,
        id: 'live:fixture',
        provider: 'fixture',
        freshness: 'unknown' as const,
        listing: { ...valid.metadata.listing, id: 'live:fixture' },
      },
    };
    expect(() => new DatasetRepository(backend()).save(live)).toThrow(
      'not enabled',
    );
  });
  it('leaves unsupported storage schemas in place while using memory defaults', async () => {
    let written = false;
    const store = new DatasetRepository({
      read: async () => ({ version: 99, datasets: [] }),
      write: async () => {
        written = true;
      },
    });
    expect((await store.initialize()).persistent).toBe(false);
    await store.save(fixtureDataset());
    expect(written).toBe(false);
  });
  it('enforces the total candle bound while preserving the newest selection', async () => {
    const rows: Candle[] = Array.from({ length: 50_000 }, (_, i) => ({
      time: new Date(Date.UTC(1800, 0, 1 + i))
        .toISOString()
        .slice(0, 10) as Candle['time'],
      open: 10,
      high: 13,
      low: 9,
      close: 12,
      volume: 100,
    }));
    const store = new DatasetRepository(backend());
    for (const id of ['oldest', 'middle', 'newest'])
      await store.save(fixtureDataset(rows, id));
    expect(
      store.snapshot().datasets.map((dataset) => dataset.metadata.id),
    ).toEqual(['import:newest:daily', 'import:middle:daily']);
    expect(store.snapshot().selectedId).toBe('import:newest:daily');
  });
});

it('awaits a committed transaction when its watchdog fires before the completion event', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const transaction = {
      objectStore: () => ({ get: () => ({}) }),
      abort: vi.fn(() => {
        throw new DOMException('already committed', 'InvalidStateError');
      }),
      oncomplete: null as (() => void) | null,
    };
    const database = { transaction: () => transaction, close: vi.fn() };
    const openRequest = {
      result: database,
      onsuccess: null as (() => void) | null,
    };
    const factory = {
      open: () => {
        queueMicrotask(() => openRequest.onsuccess!());
        return openRequest;
      },
    };
    const result = new IndexedDbBackend(
      factory as unknown as IDBFactory,
    ).read();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(10_000);
    expect(transaction.abort).toHaveBeenCalledOnce();
    transaction.oncomplete!();
    await expect(result).resolves.toBeUndefined();
    expect(database.close).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
