import type { TradingDate } from '../data/types';
import type { CloseSeries } from '../correlation/history';
import type { MarketId } from '../correlation/markets';
import { drawdown } from '../indicators/core';

export type PerformancePeriod = '1M' | '3M' | '6M' | '1Y';
export const performancePeriods: PerformancePeriod[] = ['1M', '3M', '6M', '1Y'];
const periodMonths: Record<PerformancePeriod, number> = {
  '1M': 1,
  '3M': 3,
  '6M': 6,
  '1Y': 12,
};
export const periodNames: Record<PerformancePeriod, string> = {
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  '1Y': '1 year',
};
/** Calendar history requested once; every period is cut from it locally. */
export const performanceLookbackDays = 400;
/** The categorical palette has eight validated colours, so at most eight lines. */
export const maxStocks = 8;

/** An index fund per market, drawn as a neutral reference line. */
export const benchmarks: Record<MarketId, { ticker: string; name: string }> = {
  dow: { ticker: 'DIA', name: 'Dow Jones (DIA)' },
  sp500: { ticker: 'SPY', name: 'S&P 500 (SPY)' },
  nasdaq100: { ticker: 'QQQ', name: 'Nasdaq-100 (QQQ)' },
  nse: { ticker: 'NIFTYBEES', name: 'Nifty 50 (NIFTYBEES)' },
};

export interface PerformanceLine {
  symbol: string;
  /** Percent change from the first date, one value per result date. */
  changes: number[];
  total: number;
  /** Largest fall from a peak within the period, as a negative percent. */
  maxDrawdown: number;
}
export interface PerformanceResult {
  period: PerformancePeriod;
  dates: TradingDate[];
  stocks: PerformanceLine[];
  benchmark: PerformanceLine | null;
  skipped: { symbol: string; reason: string }[];
}

export class PerformanceHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformanceHistoryError';
  }
}

/** The same day `months` earlier, clamped to the end of a shorter month. */
export function monthsBefore(date: TradingDate, months: number): TradingDate {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10) as TradingDate;
}

const addDays = (date: string, days: number) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
const sortedDates = (closes: Map<TradingDate, number>) =>
  [...closes.keys()].sort();

/**
 * Percent change of each stock (and the benchmark) from the start of the
 * period, on the sessions every included series traded. Prices are never
 * filled in. A stock without a close on the latest date, or whose history
 * starts after the period begins, is left out with a reason.
 */
export function comparePerformance(
  series: CloseSeries[],
  period: PerformancePeriod,
  benchmarkSymbol: string | null,
): PerformanceResult {
  if (!series.length)
    throw new PerformanceHistoryError('No price history loaded.');
  const end = series
    .map((item) => sortedDates(item.closes).at(-1) ?? '')
    .reduce((latest, date) => (date > latest ? date : latest), '');
  const start = monthsBefore(end as TradingDate, periodMonths[period]);
  const skipped: PerformanceResult['skipped'] = [];
  const included = series.filter((item) => {
    const dates = sortedDates(item.closes);
    if (dates.at(-1) !== end) {
      skipped.push({
        symbol: item.symbol,
        reason: `its latest close is ${dates.at(-1) ?? 'missing'}, not ${end}`,
      });
      return false;
    }
    // Weekends and holidays can put the first session a few days after the start.
    if (!dates[0] || dates[0] > addDays(start, 7)) {
      skipped.push({
        symbol: item.symbol,
        reason: `its history starts ${dates[0] ?? 'nowhere'}, after the period begins`,
      });
      return false;
    }
    return true;
  });
  const stocks = included.filter((item) => item.symbol !== benchmarkSymbol);
  if (!stocks.length)
    throw new PerformanceHistoryError(
      'No stock had enough history for this period.',
    );
  const dates = sortedDates(included[0]!.closes).filter(
    (date) => date >= start && included.every((item) => item.closes.has(date)),
  );
  if (dates.length < 2)
    throw new PerformanceHistoryError(
      'Fewer than two shared trading days in this period.',
    );
  const line = (item: CloseSeries): PerformanceLine => {
    const closes = dates.map((date) => item.closes.get(date)!);
    const base = closes[0]!;
    const changes = closes.map((close) => 100 * (close / base - 1));
    return {
      symbol: item.symbol,
      changes,
      total: changes.at(-1)!,
      maxDrawdown: Math.min(
        0,
        ...drawdown(closes).filter((value): value is number => value !== null),
      ),
    };
  };
  const benchmark = included.find((item) => item.symbol === benchmarkSymbol);
  return {
    period,
    dates,
    // Input order is kept so each stock keeps its colour across periods.
    stocks: stocks.map(line),
    benchmark: benchmark ? line(benchmark) : null,
    skipped,
  };
}

export const formatChange = (value: number, digits = 1) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}%`;
