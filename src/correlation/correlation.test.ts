import { expect, it } from 'vitest';
import type { TradingDate } from '../data/types';
import {
  correlationMatrix,
  InsufficientHistoryError,
  pearson,
} from './correlation';
import type { Period } from './correlation';
import type { CloseSeries } from './history';
import { cellColors, formatCorrelation, legendGradient } from './heatmap';

const days = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      new Date(Date.UTC(2026, 0, 5 + i))
        .toISOString()
        .slice(0, 10) as TradingDate,
  );
function series(
  symbol: string,
  closes: number[],
  dates = days(closes.length),
): CloseSeries {
  return {
    symbol,
    closes: new Map(dates.map((date, i) => [date, closes[i]!])),
  };
}

it('matches reference Pearson values (Python statistics.correlation)', () => {
  expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(
    0.7745966692414834,
    12,
  );
  expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  expect(() => pearson([1], [1])).toThrow();
});

it('correlates daily returns by default and prices on request', () => {
  const a = [100, 101, 103, 102, 105, 104];
  const c = [10, 9.8, 9.9, 10.4, 10.1, 10.3];
  const half = a.map((value) => value / 2);
  const input = [series('A', a), series('C', c), series('HALF', half)];
  const returns = correlationMatrix(input, 5 as Period, 'returns');
  expect(returns.matrix[0]![1]).toBeCloseTo(-0.7964967973593865, 12);
  expect(returns.matrix[0]![2]).toBeCloseTo(1, 12);
  expect(returns.matrix[1]![0]).toBe(returns.matrix[0]![1]);
  expect(returns.matrix.map((row, i) => row[i])).toEqual([1, 1, 1]);
  expect(returns.observations).toBe(5);
  expect(
    correlationMatrix(input, 6 as Period, 'prices').matrix[0]![1],
  ).toBeCloseTo(0.346102651323106, 12);
});

it('uses the latest window and only sessions every stock traded', () => {
  const dates = days(40);
  const a = series(
    'A',
    dates.map((_, i) => 100 + Math.sin(i) * 3),
    dates,
  );
  // B misses one session; that date is dropped for every pair.
  const gap = dates.filter((_, i) => i !== 35);
  const b = series(
    'B',
    gap.map((_, i) => 50 + Math.cos(i) * 2),
    gap,
  );
  const result = correlationMatrix([a, b], 30, 'returns');
  expect(result.dates).toHaveLength(31);
  expect(result.dates).not.toContain(dates[35]);
  expect(result.dates.at(-1)).toBe(dates.at(-1));
  expect(result.observations).toBe(30);
});

it('reports insufficient shared history and constant series honestly', () => {
  const short = [series('A', [1, 2, 3, 4]), series('B', [4, 3, 2, 1])];
  expect(() => correlationMatrix(short, 15, 'returns')).toThrow(
    InsufficientHistoryError,
  );
  const flat = correlationMatrix(
    [series('A', [1, 2, 3, 2, 3]), series('FLAT', [5, 5, 5, 5, 5])],
    4 as Period,
    'returns',
  );
  expect(flat.matrix[1]).toEqual([null, null]);
  expect(() => correlationMatrix([series('A', [1, 2])], 15, 'returns')).toThrow(
    'two stocks',
  );
});

it('offers a green and red palette with readable text and a matching legend', () => {
  expect(cellColors(1, 'green-red').background).toContain('hsl(142');
  expect(cellColors(-1, 'green-red').background).toContain('hsl(3,');
  expect(cellColors(1, 'green-red').color).toBe('#ffffff');
  expect(cellColors(-0.8, 'green-red').color).toBe('#ffffff');
  expect(cellColors(0.05, 'green-red').color).toBe('#1b2430');
  expect(cellColors(0.5)).toEqual(cellColors(0.5, 'blue-orange'));
  expect(cellColors(null, 'green-red').color).toBe('var(--muted-text)');
  expect(legendGradient('green-red')).toMatch(
    /^linear-gradient\(to right, hsl\(3,.*hsl\(142, 60%, 32%\)\)$/,
  );
  expect(legendGradient()).toContain('hsl(214, 68%, 38%)');
});

it('colours positive blue and negative orange with readable text', () => {
  expect(cellColors(1).background).toContain('hsl(214');
  expect(cellColors(-1).background).toContain('hsl(27');
  expect(cellColors(1).color).toBe('#ffffff');
  expect(cellColors(0.05).color).toBe('#1b2430');
  expect(cellColors(null).color).toBe('var(--muted-text)');
  expect(formatCorrelation(-0.371)).toBe('−0.37');
  expect(formatCorrelation(null)).toBe('–');
  expect(formatCorrelation(-0.001)).toBe('0.00');
  expect(formatCorrelation(-0.005)).toBe('−0.01');
});
