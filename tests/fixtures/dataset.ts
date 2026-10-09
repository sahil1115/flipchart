import type { Candle, Dataset } from '../../src/data/types';
/** Small hand-authored, auditable OHLCV fixture. */
export const fixtureCandles: Candle[] = [
  { time: '2024-01-01', open: 10, high: 13, low: 9, close: 12, volume: 100 },
  { time: '2024-01-02', open: 12, high: 14, low: 11, close: 13, volume: 200 },
  { time: '2024-01-03', open: 13, high: 15, low: 12, close: 14, volume: 300 },
  { time: '2024-01-04', open: 14, high: 16, low: 13, close: 15, volume: 400 },
  { time: '2024-01-05', open: 15, high: 17, low: 14, close: 16, volume: 500 },
  { time: '2024-01-08', open: 16, high: 18, low: 15, close: 17, volume: null },
];
export function fixtureDataset(
  candles: Candle[] = fixtureCandles,
  identity = 'fixture',
): Dataset {
  return {
    candles,
    metadata: {
      id: `import:${identity}:daily`,
      revision: 'fixture-v1',
      mode: 'import',
      source: 'User CSV fixture',
      provider: null,
      listing: {
        id: `import:${identity}`,
        symbol: identity.toUpperCase(),
        name: 'Fixture',
        exchange: null,
        mic: null,
        currency: 'USD',
        timezone: 'America/New_York',
      },
      interval: 'daily',
      adjustment: 'raw',
      requestedRange: null,
      coverage: candles.length
        ? { from: candles[0]!.time, to: candles.at(-1)!.time }
        : null,
      retrievedAt: '2026-10-09T00:00:00Z',
      latestCandleTime: candles.at(-1)?.time ?? null,
      freshness: 'historical-import',
      delay: 'unknown',
      aggregation: null,
    },
  };
}
