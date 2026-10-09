import { describe, expect, it } from 'vitest';
import { isTradingDate, normalizeCandles } from './normalize';
import type { Candle } from './types';
const a: Candle = {
  time: '2024-02-29',
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: null,
};
const b: Candle = {
  time: '2024-03-04',
  open: 11,
  high: 13,
  low: 10,
  close: 12,
  volume: 0,
};
describe('daily normalization', () => {
  it('sorts, retains gaps and date identity, and coalesces exact duplicates without mutation', () => {
    const rows = [b, a, { ...a }];
    expect(normalizeCandles(rows)).toEqual([a, b]);
    expect(rows[0]).toBe(b);
    expect(normalizeCandles(rows)[0]).not.toBe(a);
  });
  it('retains unknown volume as null and legitimate zero values', () => {
    expect(normalizeCandles([a, b]).map((row) => row.volume)).toEqual([
      null,
      0,
    ]);
    expect(
      normalizeCandles([{ ...a, open: 0, close: 0, high: 0, low: 0 }])[0]
        ?.close,
    ).toBe(0);
  });
  it.each([
    '2023-02-29',
    '2024-02-30',
    '2024-13-01',
    '02/03/2024',
    '2024-2-3',
    '2024-02-29T00:00:00Z',
  ])('rejects malformed or ambiguous date %s', (time) => {
    expect(isTradingDate(time)).toBe(false);
    expect(() =>
      normalizeCandles([{ ...a, time: time as Candle['time'] }]),
    ).toThrow('Row 1');
  });
  it('accepts valid leap dates without browser timezone conversion', () =>
    expect(isTradingDate('2024-02-29')).toBe(true));
  it.each([
    { high: 10 },
    { low: 11 },
    { low: 13 },
    { open: NaN },
    { close: Infinity },
    { volume: -1 },
    { volume: NaN },
  ])('rejects invalid values %j', (override) => {
    expect(() => normalizeCandles([b, { ...a, ...override }])).toThrow('Row 2');
  });
  it('rejects conflicting duplicates with an actionable date', () => {
    expect(() => normalizeCandles([a, { ...a, close: 10 }])).toThrow(
      'conflicting duplicate date 2024-02-29',
    );
  });
  it('allows flat bars and empty history', () => {
    expect(
      normalizeCandles([{ ...a, high: 10, low: 10, close: 10 }]),
    ).toHaveLength(1);
    expect(normalizeCandles([])).toEqual([]);
  });
});
