import { describe, expect, it } from 'vitest';
import reference from '../../tests/fixtures/indicator-reference.json';
import type { Candle } from '../data/types';
import { fixtureDataset } from '../../tests/fixtures/dataset';
import {
  atr,
  bollinger,
  calculate,
  calculateDataset,
  defaults,
  drawdown,
  ema,
  latestValue,
  macd,
  obv,
  rsi,
  sma,
  validateParameters,
  worstSoFar,
} from './core';
import type { Outputs, Values } from './core';

const bars = reference.candles as Candle[];
function compare(actual: Values, expected: Values) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, i) => {
    if (value === null) expect(actual[i], `warm-up at ${i}`).toBeNull();
    else {
      expect(actual[i], `value at ${i}`).not.toBeNull();
      expect(
        Math.abs(actual[i]! - value),
        `reference at ${i}`,
      ).toBeLessThanOrEqual(
        reference.reference.absoluteTolerance +
          Math.abs(value) * reference.reference.relativeTolerance,
      );
    }
  });
}
describe('independent TA-Lib reference', () => {
  for (const [index, fixture] of reference.cases.entries())
    it(`matches every aligned output with parameter set ${index + 1}`, () => {
      const actual = calculate(bars, { ...defaults, ...fixture.parameters });
      for (const key of [
        'smaShort',
        'smaMedium',
        'smaLong',
        'emaFast',
        'emaSlow',
        'volumeAverage',
        'rsi',
        'atr',
        'obv',
      ] as const)
        compare(actual[key], fixture.expected[key]);
      for (const key of ['middle', 'upper', 'lower'] as const)
        compare(actual.bollinger[key], fixture.expected.bollinger[key]);
      for (const key of ['line', 'signal', 'histogram'] as const)
        compare(actual.macd[key], fixture.expected.macd[key]);
    });
});
it('handles empty and short input without inventing zeros', () => {
  const result = calculate([], defaults);
  expect(result.rsi).toEqual([]);
  const short = calculate(bars.slice(0, 3), defaults);
  expect(short.smaLong).toEqual([null, null, null]);
  expect(short.macd.line).toEqual([null, null, null]);
  expect(short.atr).toEqual([null, null, null]);
});
it('keeps valid zeros for flat zero-range prices and volume', () => {
  const flat = bars.slice(0, 40).map((bar) => ({
    ...bar,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: 0,
  }));
  const result = calculate(flat, defaults);
  expect(result.rsi[14]).toBe(0);
  expect(result.atr[14]).toBe(0);
  expect(result.macd.histogram[33]).toBe(0);
  expect(result.obv.at(-1)).toBe(0);
  expect(result.volumeAverage[19]).toBe(0);
  expect(result.bollinger.upper[19]).toBe(10);
});
it('honestly propagates unknown volume and recovers only complete rolling windows', () => {
  expect(sma([1, null, 3, 0, 5], 2)).toEqual([null, null, null, 1.5, 2.5]);
  const input = bars
    .slice(0, 4)
    .map((bar, i) => ({ ...bar, volume: i === 2 ? null : 10 }));
  expect(obv(input)).toEqual([10, 20, null, 10]);
  expect(calculate(input, defaults).rsi).toEqual([null, null, null, null]);
});
it('restarts OBV from the next known volume after an unknown-volume gap', () => {
  const input = bars.slice(0, 6).map((bar, i) => ({
    ...bar,
    close: [10, 11, 12, 13, 12, 14][i]!,
    volume: [5, 2, null, 4, 3, 6][i]!,
  }));
  expect(obv(input)).toEqual([5, 7, null, 4, 1, 7]);
});
it('uses first-volume OBV baseline and unchanged total on equal closes', () => {
  const input = bars.slice(0, 4).map((bar, i) => ({
    ...bar,
    close: [10, 11, 11, 9][i]!,
    volume: [5, 2, 3, 4][i]!,
  }));
  expect(obv(input)).toEqual([5, 7, 7, 3]);
});
it('uses observed sessions across gaps and raw or consistently adjusted OHLC', () => {
  const input = bars.slice(0, 40);
  const moved = input.map((bar, i) => ({
    ...bar,
    time: `2030-01-${String(i + 1).padStart(2, '0')}` as Candle['time'],
  }));
  expect(calculate(moved, defaults)).toEqual(calculate(input, defaults));
  const adjusted = input.map((bar) => ({
    ...bar,
    open: bar.open / 2,
    high: bar.high / 2,
    low: bar.low / 2,
    close: bar.close / 2,
  }));
  const raw = calculate(input, defaults),
    scaled = calculate(adjusted, defaults);
  compare(scaled.rsi, raw.rsi);
  compare(
    scaled.atr,
    raw.atr.map((value) => (value === null ? null : value / 2)),
  );
  compare(
    scaled.macd.line,
    raw.macd.line.map((value) => (value === null ? null : value / 2)),
  );
});
it('excludes incomplete candles while preserving dates and earlier finalized latest values', () => {
  const input = bars
    .slice(0, 40)
    .map((bar, i) => ({ ...bar, incomplete: i === 39 }));
  const actual = calculate(input, defaults),
    finalized = calculate(input.slice(0, 39), defaults);
  expect(actual.rsi.slice(0, 39)).toEqual(finalized.rsi);
  expect(actual.rsi[39]).toBeNull();
  expect(latestValue(input, actual.rsi)?.time).toBe(input[38]!.time);
});
it('memoizes complete history by dataset revision and parameter set, independent of visible window', () => {
  const dataset = fixtureDataset();
  dataset.candles = bars;
  const result = calculateDataset(dataset, defaults);
  expect(calculateDataset(dataset, { ...defaults })).toBe(result);
  const tail = result.rsi.slice(-22);
  expect(calculateDataset(dataset, defaults).rsi.slice(-22)).toEqual(tail);
  expect(calculateDataset(dataset, { ...defaults, rsiPeriod: 7 })).not.toBe(
    result,
  );
  dataset.metadata.revision = 'new';
  expect(calculateDataset(dataset, defaults)).not.toBe(result);
});
it('validates every parameter before replacing calculations', () => {
  for (const value of [0, 1, -2, 2.5, NaN, Infinity, 5001])
    expect(
      validateParameters({ ...defaults, rsiPeriod: value }),
    ).not.toBeNull();
  expect(validateParameters({ ...defaults, macdFast: 26 })).toMatch(/fast/);
  expect(validateParameters({ ...defaults, emaFast: 26 })).toMatch(/EMA/);
  expect(validateParameters({ ...defaults, smaShort: 50 })).toMatch(/SMA/);
  expect(validateParameters({ ...defaults, bbDeviation: 0 })).toMatch(
    /deviation/,
  );
  expect(() => sma([1, 2], 1)).toThrow(RangeError);
  expect(() => ema([1, 2], NaN)).toThrow(RangeError);
  expect(() => rsi([1, 2], 0)).toThrow(RangeError);
  expect(() => atr([], 0)).toThrow(RangeError);
  expect(() => bollinger([1, 2], 2, Infinity)).toThrow(RangeError);
  expect(() => macd([1, 2], 4, 3, 2)).toThrow(RangeError);
});
it('never emits NaN or Infinity for numeric overflow', () => {
  const huge = bars.map((bar) => ({
    ...bar,
    open: 1e308,
    high: 1e308,
    low: -1e308,
    close: 1e308,
    volume: 1e308,
  }));
  const result = calculate(huge, defaults);
  const all = (o: Outputs) => [
    o.smaShort,
    o.emaFast,
    o.volumeAverage,
    o.rsi,
    o.atr,
    o.obv,
    o.bollinger.upper,
    o.macd.line,
  ];
  expect(
    all(result)
      .flat()
      .every((value) => value === null || Number.isFinite(value)),
  ).toBe(true);
});

it('measures drawdown from the running peak and keeps unknown closes unknown', () => {
  const closes = [100, 120, 90, null, 60, 130, 117];
  const result = drawdown(closes);
  expect(result[0]).toBe(0);
  expect(result[1]).toBe(0); // new high
  expect(result[2]).toBeCloseTo(-25, 10); // 90 / 120
  expect(result[3]).toBeNull();
  expect(result[4]).toBeCloseTo(-50, 10); // 60 / 120
  expect(result[5]).toBe(0); // recovered to a new high
  expect(result[6]).toBeCloseTo(-10, 10); // 117 / 130
  expect(worstSoFar(result)).toEqual([
    0,
    0,
    result[2],
    null,
    result[4],
    result[4],
    result[4],
  ]);
  // Non-positive closes cannot set a peak or produce a reading.
  expect(drawdown([0, -5, 10, 5])).toEqual([null, null, 0, -50]);
  expect(drawdown([])).toEqual([]);
});

it('includes drawdown in the calculated outputs, aligned and skipping provisional bars', () => {
  const candles = [100, 80, 90].map((close, index) => ({
    time: `2026-01-0${index + 5}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    ...(index === 2 ? { incomplete: true } : {}),
  })) as Candle[];
  const outputs = calculate(candles, defaults);
  const [first, second, provisional] = outputs.drawdown.current;
  expect(first).toBe(0);
  expect(second).toBeCloseTo(-20, 10);
  expect(provisional).toBeNull();
  expect(outputs.drawdown.worst[1]).toBe(second);
  expect(outputs.drawdown.worst[2]).toBeNull();
});
