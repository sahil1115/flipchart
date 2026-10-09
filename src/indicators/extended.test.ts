import { expect, it } from 'vitest';
import reference from '../../tests/fixtures/extended-reference.json';
import type { Candle } from '../data/types';
import { calculate, calculateDataset, defaults } from './core';
import type { Values } from './core';
import {
  stochastic,
  directional,
  cci,
  williams,
  roc,
  historicalVolatility,
} from './extended';
import { fixtureDataset } from '../../tests/fixtures/dataset';
function compare(actual: Values, expected: Values) {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => {
    if (value === null) expect(actual[index], `warmup ${index}`).toBeNull();
    else {
      expect(actual[index], `available ${index}`).not.toBeNull();
      expect(
        Math.abs(actual[index]! - value),
        `oracle ${index}`,
      ).toBeLessThanOrEqual(1e-8 + Math.abs(value) * 1e-10);
    }
  });
}
for (const [index, fixture] of reference.cases.entries())
  it(`matches independent TA-Lib and NumPy outputs, case ${index + 1}`, () => {
    const bars = fixture.candles as Candle[];
    const p = { ...defaults, ...fixture.parameters };
    const result = calculate(bars, p);
    compare(result.cci, fixture.expected.cci);
    compare(result.williams, fixture.expected.williams);
    compare(result.roc, fixture.expected.roc);
    for (const key of ['k', 'd'] as const)
      compare(result.stochastic[key], fixture.expected.stochastic[key]);
    for (const key of ['adx', 'plus', 'minus'] as const)
      compare(result.directional[key], fixture.expected.directional[key]);
    for (const interval of ['daily', 'weekly', 'monthly'] as const)
      compare(
        calculate(bars, p, interval).volatility,
        fixture.expected.volatility[interval],
      );
  });
const bars = reference.cases[0]!.candles as Candle[];
it('uses aligned nulls for short histories and excludes provisional data from all extended outputs', () => {
  expect(stochastic(bars.slice(0, 3), 14, 3, 3).k).toEqual([null, null, null]);
  const result = calculate(
    bars.slice(0, 40).map((bar, i) => ({ ...bar, incomplete: i === 39 })),
    defaults,
  );
  const finalized = calculate(bars.slice(0, 39), defaults);
  for (const key of ['cci', 'williams', 'roc', 'volatility'] as const)
    expect(result[key]).toEqual([...finalized[key], null]);
  expect(result.directional.adx).toEqual([...finalized.directional.adx, null]);
  expect(result.stochastic.k).toEqual([...finalized.stochastic.k, null]);
});
it('handles directional ties, monotonic trends and zero range without trade interpretations', () => {
  const flat = bars
    .slice(0, 40)
    .map((bar) => ({ ...bar, open: 10, high: 10, low: 10, close: 10 }));
  const result = calculate(flat, defaults);
  expect(result.directional.adx[27]).toBe(0);
  expect(result.directional.plus[14]).toBe(0);
  expect(result.cci[19]).toBe(0);
  expect(result.williams[13]).toBe(0);
  expect(result.stochastic.k[17]).toBe(0);
  expect(result.volatility[20]).toBe(0);
  const trend = flat.map((bar, i) => ({
    ...bar,
    open: 10 + i,
    high: 11 + i,
    low: 9 + i,
    close: 10 + i,
  }));
  expect(directional(trend, 14).adx.at(-1)).toBe(100);
  expect(directional(trend, 14).minus.at(-1)).toBe(0);
  const ties = flat.map((bar, i) => ({ ...bar, high: 10 + i, low: 10 - i }));
  expect(directional(ties, 14).plus.at(-1)).toBe(0);
  expect(directional(ties, 14).minus.at(-1)).toBe(0);
});
it('marks zero ROC denominators and non-positive log-return windows unavailable and recovers later', () => {
  expect(roc([0, 2, 4, 6, 8], 2)).toEqual([null, null, null, 200, 100]);
  const vol = historicalVolatility([1, 0, 1, 2, 4, 8], 2, 252);
  expect(vol.slice(0, 4)).toEqual([null, null, null, null]);
  expect(vol[4]).toBeCloseTo(0, 10);
  expect(historicalVolatility([1, -1, 2], 2, 252)[2]).toBeNull();
});
it('preserves dimensionless values on consistent corporate-action scaling, across gaps and unknown volume', () => {
  const scaled = bars.map((bar) => ({
    ...bar,
    open: bar.open / 2,
    high: bar.high / 2,
    low: bar.low / 2,
    close: bar.close / 2,
    volume: null,
  }));
  const a = calculate(bars, defaults),
    b = calculate(scaled, defaults);
  for (const key of ['cci', 'williams', 'roc', 'volatility'] as const)
    compare(b[key], a[key]);
  compare(b.directional.adx, a.directional.adx);
  compare(b.stochastic.k, a.stochastic.k);
});
it('validates each extended period and contains numeric overflow', () => {
  expect(() => stochastic([], 0, 3, 3)).toThrow(RangeError);
  expect(() => directional([], 1)).toThrow(RangeError);
  expect(() => cci([], NaN)).toThrow(RangeError);
  expect(() => williams([], Infinity)).toThrow(RangeError);
  expect(() => roc([], 5001)).toThrow(RangeError);
  expect(() => historicalVolatility([], 2, 0)).toThrow(RangeError);
  const huge = bars.map((bar) => ({
    ...bar,
    high: 1e308,
    low: -1e308,
    close: 1e308,
  }));
  const result = calculate(huge, defaults);
  const values = [
    result.cci,
    result.williams,
    result.roc,
    result.volatility,
    result.directional.plus,
    result.directional.adx,
    result.stochastic.k,
  ].flat();
  expect(
    values.every((value) => value === null || Number.isFinite(value)),
  ).toBe(true);
});
it('uses interval-specific annualization in cached dataset calculations', () => {
  const daily = fixtureDataset(bars),
    weekly = {
      ...daily,
      metadata: { ...daily.metadata, interval: 'weekly' as const },
    };
  const d = calculateDataset(daily, defaults),
    w = calculateDataset(weekly, defaults);
  expect(w.volatility.at(-1)! / d.volatility.at(-1)!).toBeCloseTo(
    Math.sqrt(52 / 252),
    12,
  );
  expect(calculateDataset(weekly, defaults)).toBe(w);
});
