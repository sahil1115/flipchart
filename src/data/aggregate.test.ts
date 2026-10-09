import { expect, it } from 'vitest';
import { fixtureCandles, fixtureDataset } from '../../tests/fixtures/dataset';
import { aggregateDaily } from './aggregate';
import type { Candle } from './types';
it('aggregates an audited full week and exposes a partial trailing week with unknown volume', () => {
  const result = aggregateDaily(fixtureDataset(), 'weekly');
  expect(result.candles).toEqual([
    {
      time: '2024-01-01',
      open: 10,
      high: 17,
      low: 9,
      close: 16,
      volume: 1500,
      incomplete: false,
    },
    {
      time: '2024-01-08',
      open: 16,
      high: 18,
      low: 15,
      close: 17,
      volume: null,
      incomplete: true,
    },
  ]);
  expect(result.metadata.listing.timezone).toBe('America/New_York');
  expect(result.metadata.aggregationDetails?.sourceCoverage).toEqual({
    from: '2024-01-01',
    to: '2024-01-08',
  });
  expect(result.metadata.aggregationDetails?.groups[1]).toMatchObject({
    count: 1,
    partial: true,
    from: '2024-01-08',
  });
});
it('uses calendar months, preserves gaps/adjustment and flags incomplete or unverified coverage', () => {
  const input = fixtureDataset([
    { time: '2024-01-31', open: 10, high: 13, low: 9, close: 12, volume: 0 },
    { time: '2024-02-01', open: 12, high: 18, low: 11, close: 16, volume: 20 },
    {
      time: '2024-02-29',
      open: 16,
      high: 17,
      low: 13,
      close: 14,
      volume: 30,
      incomplete: true,
    },
  ]);
  input.metadata.adjustment = 'adjusted';
  const result = aggregateDaily(input, 'monthly');
  expect(result.candles).toEqual([
    {
      time: '2024-01-01',
      open: 10,
      high: 13,
      low: 9,
      close: 12,
      volume: 0,
      incomplete: true,
    },
    {
      time: '2024-02-01',
      open: 12,
      high: 18,
      low: 11,
      close: 14,
      volume: 50,
      incomplete: true,
    },
  ]);
  expect(result.metadata.adjustment).toBe('adjusted');
});
it('does not invent known volume if any constituent is unavailable', () => {
  const rows = fixtureCandles
    .slice(0, 5)
    .map((row, i) => ({ ...row, volume: i === 2 ? null : row.volume }));
  expect(
    aggregateDaily(fixtureDataset(rows), 'weekly').candles[0]?.volume,
  ).toBeNull();
});
it('handles an empty dataset and rejects aggregation of already aggregated bars', () => {
  expect(aggregateDaily(fixtureDataset([]), 'monthly').candles).toEqual([]);
  expect(() =>
    aggregateDaily(aggregateDaily(fixtureDataset(), 'weekly'), 'monthly'),
  ).toThrow('daily input');
});
it('aggregates a full leap-year month without declaring missing weekends partial', () => {
  const rows = Array.from(
    { length: 29 },
    (_, i) => new Date(Date.UTC(2024, 1, 1 + i)),
  )
    .filter((date) => ![0, 6].includes(date.getUTCDay()))
    .map((date) => ({
      time: date.toISOString().slice(0, 10) as Candle['time'],
      open: 10,
      high: 20,
      low: 5,
      close: 11,
      volume: 10,
    }));
  const result = aggregateDaily(fixtureDataset(rows), 'monthly');
  expect(result.candles).toEqual([
    {
      time: '2024-02-01',
      open: 10,
      high: 20,
      low: 5,
      close: 11,
      volume: 210,
      incomplete: false,
    },
  ]);
  expect(result.metadata.aggregationDetails?.groups[0]?.count).toBe(21);
});
it('preserves source date/calendar across a year boundary and marks a historical missing weekday partial', () => {
  const rows: Candle[] = [
    '2024-12-30',
    '2024-12-31',
    '2025-01-01',
    '2025-01-02',
    '2025-01-03',
  ].map((time, i) => ({
    time: time as Candle['time'],
    open: 10 + i,
    high: 20 + i,
    low: 5 + i,
    close: 11 + i,
    volume: 0,
  }));
  const dataset = fixtureDataset(rows);
  dataset.metadata.listing.timezone = 'Asia/Tokyo';
  dataset.metadata.adjustment = 'adjusted';
  const full = aggregateDaily(dataset, 'weekly');
  expect(full.candles).toEqual([
    {
      time: '2024-12-30',
      open: 10,
      high: 24,
      low: 5,
      close: 15,
      volume: 0,
      incomplete: false,
    },
  ]);
  expect(full.metadata.listing.timezone).toBe('Asia/Tokyo');
  expect(full.metadata.adjustment).toBe('adjusted');
  const missing = aggregateDaily(
    fixtureDataset(rows.filter((_, i) => i !== 2)),
    'weekly',
  );
  expect(missing.candles[0]!.incomplete).toBe(true);
  expect(missing.metadata.aggregationDetails!.groups[0]!.partial).toBe(true);
});
