import type { Dataset } from '../data/types';
import { validateDataset } from '../data/validate';

export const CACHE_LIMITS = {
  datasets: 10,
  candles: 100_000,
  bytes: 20 * 1024 * 1024,
} as const;
export interface DatasetEnvelope {
  version: 1;
  datasets: Dataset[];
  selectedId: string | null;
}
export interface DatasetBackend {
  read(): Promise<unknown>;
  write(value: DatasetEnvelope): Promise<void>;
}
export interface LibrarySnapshot {
  datasets: Dataset[];
  selectedId: string | null;
  persistent: boolean;
  warning: string;
}
const empty = (): DatasetEnvelope => ({
  version: 1,
  datasets: [],
  selectedId: null,
});

/** A single transaction commits the bounded non-secret library and active selection together. */
export class IndexedDbBackend implements DatasetBackend {
  constructor(
    private readonly suppliedFactory?: IDBFactory,
    private readonly name = 'flipchart-datasets',
  ) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error('IndexedDB open timeout'));
      }, 10_000);
      let request: IDBOpenDBRequest;
      try {
        const factory = this.suppliedFactory ?? globalThis.indexedDB;
        if (!factory) throw new Error('IndexedDB unavailable');
        request = factory.open(this.name, 1);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('library'))
          request.result.createObjectStore('library');
      };
      request.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(request.error);
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  private async transaction(value?: DatasetEnvelope): Promise<unknown> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        'library',
        value === undefined ? 'readonly' : 'readwrite',
      );
      const timer = setTimeout(() => {
        try {
          transaction.abort();
        } catch (error) {
          // Firefox can finish a transaction before delivering oncomplete.
          // A late watchdog must await that completion, not throw globally.
          if (
            error instanceof DOMException &&
            error.name === 'InvalidStateError'
          )
            return;
          close();
          reject(error);
        }
      }, 10_000);
      const store = transaction.objectStore('library');
      let result: unknown;
      const close = () => {
        clearTimeout(timer);
        database.close();
      };
      transaction.oncomplete = () => {
        close();
        resolve(result);
      };
      transaction.onabort = () => {
        close();
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      };
      transaction.onerror = () => {
        /* onabort reports atomic transaction failure */
      };
      try {
        const request =
          value === undefined
            ? store.get('current')
            : store.put(value, 'current');
        request.onsuccess = () => {
          result = request.result;
        };
      } catch (error) {
        transaction.abort();
        close();
        reject(error);
      }
    });
  }
  read(): Promise<unknown> {
    return this.transaction();
  }
  async write(value: DatasetEnvelope): Promise<void> {
    await this.transaction(value);
  }
}

function bounded(datasets: Dataset[]): Dataset[] {
  const result: Dataset[] = [];
  let candles = 0;
  for (const dataset of datasets) {
    if (
      result.length >= CACHE_LIMITS.datasets ||
      candles + dataset.candles.length > CACHE_LIMITS.candles
    )
      break;
    const candidate = [...result, dataset];
    if (
      new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
      CACHE_LIMITS.bytes
    )
      break;
    result.push(dataset);
    candles += dataset.candles.length;
  }
  return result;
}
export class DatasetRepository {
  private envelope = empty();
  private persistent = true;
  private warning = '';
  private initialization: Promise<LibrarySnapshot> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly backend: DatasetBackend = new IndexedDbBackend(),
  ) {}
  snapshot(): LibrarySnapshot {
    return {
      ...this.envelope,
      persistent: this.persistent,
      warning: this.warning,
    };
  }
  initialize(): Promise<LibrarySnapshot> {
    this.initialization ??= this.restore();
    return this.initialization;
  }
  private async restore(): Promise<LibrarySnapshot> {
    try {
      const stored = await this.backend.read();
      if (stored !== undefined && stored !== null) {
        if (
          typeof stored !== 'object' ||
          !('version' in stored) ||
          stored.version !== 1 ||
          !('datasets' in stored) ||
          !Array.isArray(stored.datasets) ||
          !('selectedId' in stored) ||
          (stored.selectedId !== null && typeof stored.selectedId !== 'string')
        )
          throw new Error('Unsupported library schema');
        const validated: Dataset[] = [];
        for (const item of stored.datasets.slice(0, CACHE_LIMITS.datasets)) {
          try {
            const dataset = validateDataset(item);
            if (dataset.metadata.mode === 'live')
              throw new Error('Provider caching is not enabled');
            if (
              !validated.some(
                (existing) => existing.metadata.id === dataset.metadata.id,
              )
            )
              validated.push(dataset);
          } catch {
            this.warning =
              'Some saved datasets were invalid or unsupported and were not restored. Reimport their original CSV files.';
          }
        }
        const datasets = bounded(validated);
        this.envelope = {
          version: 1,
          datasets,
          selectedId: datasets.some(
            (dataset) => dataset.metadata.id === stored.selectedId,
          )
            ? (stored.selectedId as string)
            : null,
        };
      }
    } catch {
      this.failStorage();
    }
    return this.snapshot();
  }
  private failStorage() {
    this.persistent = false;
    this.warning =
      'Browser storage is unavailable or full. Data and changes remain usable for this session only. Previously saved data may reappear after reload.';
  }
  private update(
    transform: (value: DatasetEnvelope) => DatasetEnvelope,
  ): Promise<LibrarySnapshot> {
    const operation = this.queue.then(async () => {
      await this.initialize();
      this.envelope = transform(this.envelope);
      if (this.persistent) {
        try {
          await this.backend.write(this.envelope);
        } catch {
          this.failStorage();
        }
      }
      return this.snapshot();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  save(input: Dataset): Promise<LibrarySnapshot> {
    const dataset = validateDataset(input);
    if (dataset.metadata.mode === 'live')
      throw new Error('Provider cache persistence is not enabled yet.');
    return this.update((value) => ({
      version: 1,
      datasets: bounded([
        dataset,
        ...value.datasets.filter(
          (existing) => existing.metadata.id !== dataset.metadata.id,
        ),
      ]),
      selectedId: dataset.metadata.id,
    }));
  }
  select(id: string | null): Promise<LibrarySnapshot> {
    return this.update((value) => {
      if (id === null) return { ...value, selectedId: null };
      const selected = value.datasets.find(
        (dataset) => dataset.metadata.id === id,
      );
      if (!selected) throw new Error('Dataset is no longer available.');
      return {
        ...value,
        datasets: [
          selected,
          ...value.datasets.filter((dataset) => dataset.metadata.id !== id),
        ],
        selectedId: id,
      };
    });
  }
  delete(id: string): Promise<LibrarySnapshot> {
    return this.update((value) => ({
      ...value,
      datasets: value.datasets.filter((dataset) => dataset.metadata.id !== id),
      selectedId: value.selectedId === id ? null : value.selectedId,
    }));
  }
  clear(): Promise<LibrarySnapshot> {
    return this.update(() => empty());
  }
}
