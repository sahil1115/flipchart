import { describe, expect, it } from 'vitest';
import type { TradingDate } from '../data/types';
import type { CloseSeries } from '../correlation/history';
import { findMarket } from '../correlation/markets';
import { relaySymbolPattern } from '../server/yahoo-relay';
import { lineColors, performanceLayout } from './layout';
import {
  benchmarks,
  comparePerformance,
  formatChange,
  monthsBefore,
  PerformanceHistoryError,
} from './performance';

/** Weekday closes ending on 2026-10-28, oldest first. */
function weekdays(count: number, end = '2026-10-28') {
  const dates: TradingDate[] = [];
  const day = new Date(`${end}T00:00:00Z`);
  while (dates.length < count) {
    if (![0, 6].includes(day.getUTCDay()))
      dates.unshift(day.toISOString().slice(0, 10) as TradingDate);
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return dates;
}
const series = (
  symbol: string,
  values: (index: number) => number,
  dates = weekdays(300),
): CloseSeries => ({
  symbol,
  closes: new Map(dates.map((date, index) => [date, values(index)])),
});

describe('period start', () => {
  it('steps back whole months and clamps to shorter months', () => {
    expect(monthsBefore('2026-10-28' as TradingDate, 3)).toBe('2026-07-28');
    expect(monthsBefore('2026-03-31' as TradingDate, 1)).toBe('2026-02-28');
    expect(monthsBefore('2024-03-31' as TradingDate, 1)).toBe('2024-02-29');
    expect(monthsBefore('2026-01-15' as TradingDate, 1)).toBe('2025-12-15');
    expect(monthsBefore('2026-10-28' as TradingDate, 12)).toBe('2025-10-28');
  });
});

describe('comparing performance', () => {
  it('rebases every line to the first shared day of the period', () => {
    const result = comparePerformance(
      [
        series('UP', (i) => 100 + i),
        series('FLAT', () => 50),
        series('SPY', (i) => 200 + i / 2),
      ],
      '3M',
      'SPY',
    );
    expect(result.dates[0]).toBe('2026-07-28');
    expect(result.dates.at(-1)).toBe('2026-10-28');
    expect(result.stocks.map((line) => line.symbol)).toEqual(['UP', 'FLAT']);
    expect(result.benchmark?.symbol).toBe('SPY');
    for (const line of [...result.stocks, result.benchmark!])
      expect(line.changes[0]).toBe(0);
    // Hand check: UP goes from its close on the first day to its last close.
    const up = series('UP', (i) => 100 + i).closes;
    const first = up.get(result.dates[0]!)!;
    const last = up.get(result.dates.at(-1)!)!;
    expect(result.stocks[0]!.total).toBeCloseTo(100 * (last / first - 1), 10);
    expect(result.stocks[1]!.total).toBe(0);
    expect(result.stocks[0]!.maxDrawdown).toBe(0);
  });

  it('measures the largest fall from a peak inside the period only', () => {
    // Flat at 100, then up to 120, down to 90 (−25%), then a new high.
    const path = (i: number) =>
      i < 26 ? 100 : ([120, 90, 130, 130] as const)[i - 26]!;
    const result = comparePerformance(
      [series('A', path, weekdays(30))],
      '1M',
      null,
    );
    expect(result.stocks[0]!.maxDrawdown).toBeCloseTo(-25, 10);
    expect(result.stocks[0]!.total).toBeCloseTo(30, 10);
  });

  it('uses only days every series traded and never fills a price', () => {
    const dates = weekdays(60);
    const gappy = new Map(
      dates
        .filter((_, index) => index % 10 !== 5)
        .map((date, index) => [date, 100 + index]),
    );
    const result = comparePerformance(
      [series('FULL', () => 10, dates), { symbol: 'GAPPY', closes: gappy }],
      '1M',
      null,
    );
    for (const date of result.dates) expect(gappy.has(date)).toBe(true);
    expect(result.dates.length).toBeLessThan(
      dates.filter((date) => date >= '2026-09-28').length,
    );
  });

  it('leaves out stocks that are out of date or start after the period', () => {
    const result = comparePerformance(
      [
        series('OK', (i) => 100 + i),
        series('STALE', (i) => 100 + i, weekdays(300, '2026-10-20')),
        series('NEW', (i) => 100 + i, weekdays(20)),
      ],
      '3M',
      null,
    );
    expect(result.stocks.map((line) => line.symbol)).toEqual(['OK']);
    expect(result.skipped.map((item) => item.symbol)).toEqual(['STALE', 'NEW']);
    expect(result.skipped[0]!.reason).toContain('2026-10-20');
    expect(result.skipped[1]!.reason).toContain('after the period begins');
    // A short history still works for a short period.
    expect(
      comparePerformance(
        [series('NEW', (i) => 100 + i, weekdays(30))],
        '1M',
        null,
      ).stocks,
    ).toHaveLength(1);
  });

  it('explains when there is nothing to compare', () => {
    expect(() => comparePerformance([], '1M', null)).toThrow(
      PerformanceHistoryError,
    );
    expect(() =>
      comparePerformance([series('SPY', (i) => 100 + i)], '1M', 'SPY'),
    ).toThrow(/No stock/);
  });

  it('formats changes with a true minus sign', () => {
    expect(formatChange(12.345)).toBe('+12.3%');
    expect(formatChange(-4.2)).toBe('−4.2%');
    expect(formatChange(0)).toBe('0.0%');
    expect(formatChange(10, 0)).toBe('+10%');
  });
});

describe('chart layout', () => {
  const result = comparePerformance(
    [
      series('A', (i) => 100 + i),
      series('B', (i) => 100 + i * 0.99),
      series('C', (i) => 100 - i / 10),
      series('SPY', (i) => 100 + i / 2),
    ],
    '3M',
    'SPY',
  );

  it('keeps zero on the axis, colours in fixed input order and the index neutral', () => {
    const plot = performanceLayout(result, 780, 440, 'light');
    expect(plot.yTicks).toContain(0);
    expect(plot.lines.map((line) => line.color)).toEqual([
      lineColors.light[0],
      lineColors.light[1],
      lineColors.light[2],
      '#52514e',
    ]);
    expect(plot.lines.at(-1)!.benchmark).toBe(true);
    expect(plot.x(0)).toBe(plot.left);
    expect(plot.x(result.dates.length - 1)).toBe(plot.right);
    expect(plot.lines[0]!.label.text).toMatch(/^A \+/);
    const dark = performanceLayout(result, 780, 440, 'dark');
    expect(dark.lines[0]!.color).toBe(lineColors.dark[0]);
  });

  it('keeps end labels apart and drops values on narrow charts', () => {
    const plot = performanceLayout(result, 780, 440, 'light');
    const ys = plot.lines.map((line) => line.label.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(13.99);
    const narrow = performanceLayout(
      result,
      320,
      360,
      'light',
      { left: 44, right: 64, top: 16, bottom: 32 },
      false,
    );
    expect(narrow.lines[0]!.label.text).toBe('A');
    expect(narrow.xTicks).toHaveLength(3);
  });
});

describe('benchmarks', () => {
  it('names an index fund the relay and market accept for every market', () => {
    for (const [id, benchmark] of Object.entries(benchmarks)) {
      const market = findMarket(id as keyof typeof benchmarks);
      expect(benchmark.ticker).toMatch(market.tickerPattern);
      expect(`${benchmark.ticker}${market.suffix}`).toMatch(relaySymbolPattern);
    }
  });
});
