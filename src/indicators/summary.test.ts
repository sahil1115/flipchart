import { expect, it } from 'vitest';
import { dailySummary } from './summary';
import { createDemoDataset } from '../demo/dataset';
it('uses full daily coverage and excludes incomplete bars rather than deriving a year from a short view', () => {
  const dataset = createDemoDataset('2026-10-09T12:00:00Z');
  const full = dailySummary(dataset);
  expect(full.high52).not.toBeNull();
  expect(full.low52).not.toBeNull();
  expect(full.distance200).not.toBeNull();
  expect(
    dailySummary({ ...dataset, candles: dataset.candles.slice(-100) }).high52,
  ).toBeNull();
  expect(
    dailySummary({ ...dataset, candles: dataset.candles.slice(-100) })
      .distance200,
  ).toBeNull();
  const huge = {
    ...dataset.candles.at(-1)!,
    high: 1e10,
    close: 1e10,
    incomplete: true,
  };
  const result = dailySummary({
    ...dataset,
    candles: [...dataset.candles.slice(0, -1), huge],
  });
  expect(result.high52).toBeLessThan(1e10);
  expect(result.time).toBe(dataset.candles.at(-2)!.time);
});
it('does not pretend weekly coverage is daily or invent distance when a zero average exists', () => {
  const dataset = createDemoDataset('2026-10-09T12:00:00Z');
  expect(
    dailySummary({
      ...dataset,
      metadata: { ...dataset.metadata, interval: 'weekly' },
    }).high52,
  ).toBeNull();
  expect(
    dailySummary({
      ...dataset,
      candles: dataset.candles.map((bar) => ({ ...bar, close: 0 })),
    }).distance200,
  ).toBeNull();
});
it('reports the 52-week range for calendars with fewer than 252 sessions a year', () => {
  const dataset = createDemoDataset('2026-10-09T12:00:00Z');
  const last = dataset.candles.at(-1)!.time;
  const boundary = new Date(`${last}T12:00:00Z`);
  boundary.setUTCDate(boundary.getUTCDate() - 364);
  const from = boundary.toISOString().slice(0, 10);
  // Thin the window to ~245 sessions, as on NSE, while keeping the span.
  const candles = dataset.candles.filter(
    (bar, index) => bar.time < from || bar.time === from || index % 21 !== 0,
  );
  const inWindow = candles.filter((bar) => bar.time >= from).length;
  expect(inWindow).toBeLessThan(252);
  expect(dailySummary({ ...dataset, candles }).high52).not.toBeNull();
});
