import { expect, it } from 'vitest';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import { validateDataset } from './validate';
import { createDemoDataset } from '../demo/dataset';
it('validates demo/import identities and projects away undocumented fields at every level', () => {
  const original = fixtureDataset();
  const result = validateDataset({
    ...original,
    apiKey: 'secret',
    metadata: {
      ...original.metadata,
      requestUrl: 'secret',
      listing: { ...original.metadata.listing, credential: 'secret' },
    },
    candles: original.candles.map((row) => ({ ...row, requestUrl: 'secret' })),
  });
  expect(result).toEqual(original);
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(
    validateDataset(createDemoDataset('2026-10-09T00:00:00Z')).metadata.mode,
  ).toBe('demo');
});
it.each([
  { provider: 'twelve-data' },
  { id: 'demo:confused' },
  { adjustment: 'synthetic' },
  { coverage: null },
  { latestCandleTime: '2024-01-01' },
  { retrievedAt: 'yesterday' },
])('rejects inconsistent dataset metadata %j', (patch) => {
  const original = fixtureDataset();
  expect(() =>
    validateDataset({
      ...original,
      metadata: { ...original.metadata, ...patch },
    }),
  ).toThrow();
});
it('requires metadata presence but allows explicit unavailable provider listing facts', () => {
  const original = fixtureDataset();
  expect(() =>
    validateDataset({
      ...original,
      metadata: {
        ...original.metadata,
        listing: { ...original.metadata.listing, timezone: undefined },
      },
    }),
  ).toThrow('timezone');
  const result = validateDataset({
    ...original,
    metadata: {
      ...original.metadata,
      listing: { ...original.metadata.listing, timezone: null, currency: null },
    },
  });
  expect(result.metadata.listing.timezone).toBeNull();
});
it('accepts a non-negative skipped-session count only on provider datasets', () => {
  const demo = createDemoDataset('2026-10-09T12:00:00Z');
  expect(() =>
    validateDataset({
      ...demo,
      metadata: { ...demo.metadata, skippedSessions: 1 },
    }),
  ).toThrow('Skipped sessions');
  const live = {
    ...demo,
    metadata: {
      ...demo.metadata,
      id: 'live:yahoo-finance:x',
      listing: { ...demo.metadata.listing, id: 'live:yahoo-finance:X' },
      provider: 'yahoo-finance',
      mode: 'live',
      adjustment: 'unknown',
      freshness: 'unknown',
      delay: 'unknown',
    },
  };
  expect(
    validateDataset({
      ...live,
      metadata: { ...live.metadata, skippedSessions: 2 },
    }).metadata.skippedSessions,
  ).toBe(2);
  for (const bad of [-1, 1.5, '1'])
    expect(() =>
      validateDataset({
        ...live,
        metadata: { ...live.metadata, skippedSessions: bad },
      }),
    ).toThrow('Skipped sessions');
});
