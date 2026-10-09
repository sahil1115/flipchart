import { expect, it } from 'vitest';
import { createDemoDataset } from './dataset';
import { normalizeCandles } from '../data/normalize';
it('reproduces 780 validated synthetic bars independently of retrieval time', () => {
  const first = createDemoDataset('2026-10-09T00:00:00Z');
  const second = createDemoDataset('2026-10-10T00:00:00Z');
  expect(first.candles).toEqual(second.candles);
  expect(first.candles).toHaveLength(780);
  expect(normalizeCandles(first.candles)).toEqual(first.candles);
  expect(first.candles[0]).toMatchObject({
    time: '2023-01-02',
    open: 111.75,
    close: 110.7,
  });
  expect(first.metadata.mode).toBe('demo');
  expect(first.metadata.adjustment).toBe('synthetic');
  expect(first.metadata.provider).toBeNull();
  expect(first.metadata.latestCandleTime).toBe(first.candles.at(-1)?.time);
  expect(first.metadata.retrievedAt).not.toEqual(second.metadata.retrievedAt);
});
