import { describe, expect, it } from 'vitest';
import type { TradingDate } from '../data/types';
import type { CloseSeries } from '../correlation/history';
import { findMarket } from '../correlation/markets';
import { relaySymbolPattern } from '../server/yahoo-relay';
import { niceStep, plotLayout } from './layout';
import {
  buildRotation as buildRaw,
  minimumWeeks,
  momentumWeeks,
  quadrantOf,
  RotationHistoryError,
  rotationPoints as pointsRaw,
  tailPoints,
  trendWeeks,
  weeklyCloses as weeklyRaw,
} from './rotation';
import { findUniverse, rotationUniverses } from './universes';

/** Long after the test weeks, so every one of them is complete. */
const today = '2026-12-31' as TradingDate;
const weeklyCloses = (
  closes: Map<TradingDate, number>,
  on: TradingDate = today,
) => weeklyRaw(closes, on);
const rotationPoints = (
  sector: Map<TradingDate, number>,
  benchmark: Map<TradingDate, number>,
  on: TradingDate = today,
) => pointsRaw(sector, benchmark, on);
const buildRotation = (
  universe: Parameters<typeof buildRaw>[0],
  series: Parameters<typeof buildRaw>[1],
) => buildRaw(universe, series, today);

/** One close per Friday starting 2026-01-02. */
function fridays(values: number[]) {
  const closes = new Map<TradingDate, number>();
  values.forEach((value, index) => {
    const day = new Date(Date.UTC(2026, 0, 2 + index * 7));
    closes.set(day.toISOString().slice(0, 10) as TradingDate, value);
  });
  return closes;
}
const weeks = 30;
const flat = Array.from({ length: weeks }, () => 100);

describe('weekly bars', () => {
  it('keeps the last session of each Monday-to-Friday week', () => {
    const closes = new Map<TradingDate, number>([
      ['2026-10-12', 1], // Monday
      ['2026-10-14', 2],
      ['2026-10-15', 3], // Thursday
      ['2026-10-19', 4], // next Monday
      ['2026-10-16', 99], // Friday, inserted out of order on purpose
    ]);
    expect([
      ...weeklyCloses(closes, '2026-10-26' as TradingDate).values(),
    ]).toEqual([
      { date: '2026-10-16', close: 99 },
      { date: '2026-10-19', close: 4 },
    ]);
    // A weekend date belongs to the week it follows.
    expect([
      ...weeklyCloses(new Map([['2026-10-17' as TradingDate, 5]])).keys(),
    ]).toEqual(['2026-10-12']);
  });

  it('leaves out the week in progress until its Friday has passed', () => {
    const closes = new Map<TradingDate, number>([
      ['2026-10-12', 1],
      ['2026-10-16', 2],
      ['2026-10-19', 3],
      ['2026-10-20', 4],
    ]);
    const lastWeek = (on: string) =>
      [...weeklyCloses(closes, on as TradingDate).values()].at(-1)!.date;
    expect(lastWeek('2026-10-21')).toBe('2026-10-16'); // Wednesday
    expect(lastWeek('2026-10-23')).toBe('2026-10-16'); // Friday, still open
    expect(lastWeek('2026-10-24')).toBe('2026-10-20'); // Saturday: week over
  });
});

describe('rotation readings', () => {
  it('reads 100 and 100 when the sector tracks the benchmark exactly', () => {
    const points = rotationPoints(fridays(flat), fridays(flat));
    expect(points).toHaveLength(tailPoints);
    for (const point of points) {
      expect(point.ratio).toBeCloseTo(100, 10);
      expect(point.momentum).toBeCloseTo(100, 10);
    }
    expect(quadrantOf(100, 100)).toBe('leading');
  });

  it('matches an independent hand calculation of the documented formulas', () => {
    const sector = Array.from(
      { length: weeks },
      (_, i) => 100 + i * 0.8 + (i % 3),
    );
    const benchmark = Array.from({ length: weeks }, (_, i) => 100 + i * 0.3);
    const points = rotationPoints(fridays(sector), fridays(benchmark));
    // Recompute the last reading step by step.
    const rs = sector.map((value, i) => (100 * value) / benchmark[i]!);
    const ratioAt = (i: number) => {
      let sum = 0;
      for (let k = i - trendWeeks + 1; k <= i; k++) sum += rs[k]!;
      return (100 * rs[i]!) / (sum / trendWeeks);
    };
    const last = weeks - 1;
    expect(points.at(-1)!.ratio).toBeCloseTo(ratioAt(last), 10);
    expect(points.at(-1)!.momentum).toBeCloseTo(
      (100 * ratioAt(last)) / ratioAt(last - momentumWeeks),
      10,
    );
    // The tail is the latest consecutive weeks, oldest first.
    expect(points[0]!.ratio).toBeCloseTo(ratioAt(last - tailPoints + 1), 10);
    expect(points.map((p) => p.week)).toEqual(
      [...points.map((p) => p.week)].sort(),
    );
  });

  it('puts steady, accelerating, fading and falling sectors in the expected quadrants', () => {
    const benchmark = fridays(flat);
    const leading = Array.from({ length: weeks }, (_, i) => 100 + i * i * 0.05);
    const lagging = Array.from({ length: weeks }, (_, i) => 100 - i * i * 0.05);
    // Up strongly, then flat: still above its average but losing momentum.
    const weakening = Array.from({ length: weeks }, (_, i) =>
      i < weeks - 6 ? 100 + i * 2 : 100 + (weeks - 7) * 2,
    );
    // Down strongly, then flat: below its average but recovering.
    const improving = Array.from({ length: weeks }, (_, i) =>
      i < weeks - 6 ? 200 - i * 2 : 200 - (weeks - 7) * 2,
    );
    const quadrant = (values: number[]) => {
      const last = rotationPoints(fridays(values), benchmark).at(-1)!;
      return quadrantOf(last.ratio, last.momentum);
    };
    expect(quadrant(leading)).toBe('leading');
    expect(quadrant(lagging)).toBe('lagging');
    expect(quadrant(weakening)).toBe('weakening');
    expect(quadrant(improving)).toBe('improving');
  });

  it('is not bent by a part-finished current week', () => {
    // Accelerating sector, then one extra day of the next, unfinished week.
    const full = Array.from(
      { length: weeks },
      (_, i) => 100 * Math.exp(i * i * 0.0004),
    );
    const closes = fridays(full);
    const benchmark = fridays(flat);
    const monday = '2026-07-27' as TradingDate;
    closes.set(monday, full.at(-1)! * 1.02);
    benchmark.set(monday, 100);
    const finished = rotationPoints(fridays(full), fridays(flat)).at(-1)!;
    // On Tuesday the Monday bar belongs to an unfinished week and is ignored.
    const midweek = rotationPoints(
      closes,
      benchmark,
      '2026-07-28' as TradingDate,
    ).at(-1)!;
    expect(midweek).toEqual(finished);
    expect(quadrantOf(finished.ratio, finished.momentum)).toBe('leading');
    // Once that week is over it counts.
    const later = rotationPoints(
      closes,
      benchmark,
      '2026-08-01' as TradingDate,
    ).at(-1)!;
    expect(later.week).toBe(monday);
  });

  it('needs enough weeks in common with the benchmark', () => {
    const short = flat.slice(0, minimumWeeks - 1);
    expect(() => rotationPoints(fridays(short), fridays(flat))).toThrow(
      RotationHistoryError,
    );
    expect(() =>
      rotationPoints(fridays(flat.slice(0, minimumWeeks)), fridays(flat)),
    ).not.toThrow();
  });
});

describe('building a result', () => {
  const universe = findUniverse('us');
  const series = (symbol: string, values: number[]): CloseSeries => ({
    symbol,
    closes: fridays(values),
  });
  // Accelerating, so relative strength is above average and still gaining.
  const rising = Array.from({ length: weeks }, (_, i) => 100 + i * i * 0.05);

  it('computes loaded sectors and says why others are left out', () => {
    const result = buildRotation(universe, [
      series('SPY', flat),
      series('XLK', rising),
      series('XLE', flat.slice(0, 10)),
      // XLF is a week behind the others, so it is out of date.
      series('XLF', rising.slice(0, -1)),
    ]);
    expect(result.sectors.map((sector) => sector.ticker)).toEqual(['XLK']);
    expect(result.sectors[0]!.quadrant).toBe('leading');
    expect(result.benchmark).toBe('S&P 500 (SPY)');
    expect(result.asOf).toBe([...fridays(rising).keys()].at(-1));
    expect(result.skipped.map((item) => item.label).sort()).toEqual([
      'XLE',
      'XLF',
    ]);
  });

  it('refuses to guess without the benchmark or any usable sector', () => {
    expect(() => buildRotation(universe, [series('XLK', rising)])).toThrow(
      /did not load/,
    );
    expect(() =>
      buildRotation(universe, [series('SPY', flat), series('XLK', [1, 2])]),
    ).toThrow(RotationHistoryError);
  });
});

describe('chart layout', () => {
  it('chooses round tick steps and symmetric axes around 100', () => {
    expect(niceStep(0.9)).toBe(0.25);
    expect(niceStep(3.8)).toBe(1);
    expect(niceStep(7)).toBe(2);
    const result = buildRotation(findUniverse('us'), [
      { symbol: 'SPY', closes: fridays(flat) },
      {
        symbol: 'XLK',
        closes: fridays(Array.from({ length: weeks }, (_, i) => 100 + i)),
      },
    ]);
    const plot = plotLayout(result, 780, 500);
    expect((plot.xMin + plot.xMax) / 2).toBeCloseTo(100, 8);
    expect((plot.yMin + plot.yMax) / 2).toBeCloseTo(100, 8);
    expect(plot.xTicks).toContain(100);
    expect(plot.x(100)).toBeCloseTo((plot.left + plot.right) / 2, 6);
    const end = result.sectors[0]!.points.at(-1)!;
    expect(plot.x(end.ratio)).toBeGreaterThan(plot.x(100));
    expect(plot.sectors[0]!.end.x).toBeCloseTo(plot.x(end.ratio), 8);
    for (const sector of plot.sectors)
      for (const point of sector.path) {
        expect(point.x).toBeGreaterThanOrEqual(plot.left);
        expect(point.x).toBeLessThanOrEqual(plot.right);
        expect(point.y).toBeGreaterThanOrEqual(plot.top);
        expect(point.y).toBeLessThanOrEqual(plot.bottom);
      }
  });

  it('keeps labels of close dots apart', () => {
    const base = Array.from({ length: weeks }, (_, i) => 100 + i);
    const result = buildRotation(findUniverse('us'), [
      { symbol: 'SPY', closes: fridays(flat) },
      ...['XLK', 'XLC', 'XLY', 'XLP'].map((symbol) => ({
        symbol,
        closes: fridays(base),
      })),
    ]);
    const labels = plotLayout(result, 780, 500)
      .sectors.map((sector) => sector.text.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < labels.length; i++)
      expect(labels[i]! - labels[i - 1]!).toBeGreaterThanOrEqual(13.99);
  });
});

describe('universes', () => {
  it('only names symbols the relay and the market accept, once each', () => {
    for (const universe of rotationUniverses) {
      const market = findMarket(universe.marketId);
      const tickers = [
        universe.benchmark.ticker,
        ...universe.sectors.map((sector) => sector.ticker),
      ];
      expect(new Set(tickers).size).toBe(tickers.length);
      expect(new Set(universe.sectors.map((s) => s.label)).size).toBe(
        universe.sectors.length,
      );
      for (const ticker of tickers) {
        expect(ticker).toMatch(market.tickerPattern);
        expect(`${ticker}${market.suffix}`).toMatch(relaySymbolPattern);
      }
    }
    expect(findUniverse('us').sectors).toHaveLength(11);
    expect(findUniverse('india').sectors).toHaveLength(10);
  });
});
