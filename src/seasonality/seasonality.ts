import type { Candle, TradingDate } from '../data/types';

export const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
/** Averages and up-month shares need this many full months to mean anything. */
export const minimumObservations = 3;

export interface MonthCell {
  /** Percent change from the previous month's last close, or null if unknown. */
  value: number | null;
  /** The month is still in progress: it is shown but never counted in statistics. */
  partial: boolean;
}
export interface YearRow {
  year: number;
  months: MonthCell[];
  /** Percent change from the previous year's last close to this year's last close. */
  total: number | null;
  /** The year has not finished (ends before December or contains a partial month). */
  partial: boolean;
}
export interface MonthStatistics {
  count: number;
  /** Mean of the complete months, or null with fewer than three. */
  average: number | null;
  /** Share of complete months that closed up, 0–100, or null with fewer than three. */
  upShare: number | null;
}
export interface SeasonalityResult {
  /** Oldest year first. */
  years: YearRow[];
  statistics: MonthStatistics[];
  /** First and last close date used. */
  from: TradingDate;
  to: TradingDate;
}

export class SeasonalityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeasonalityError';
  }
}

const monthKey = (date: string) => date.slice(0, 7);
const previousMonthKey = (key: string) => {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
};

/**
 * Calendar-month returns from daily candles. A month's return is its last
 * close divided by the last close of the month before, so the first month of
 * the data has no return, and a month whose predecessor is missing from the
 * data is left empty instead of being bridged. Provisional candles are
 * ignored. `today` is the exchange date; the month that contains it is still
 * in progress and is flagged rather than counted.
 */
export function monthlyReturns(
  candles: readonly Candle[],
  today: string,
): SeasonalityResult {
  const lastClose = new Map<string, { close: number; date: TradingDate }>();
  const order: string[] = [];
  for (const candle of candles) {
    if (
      candle.incomplete ||
      !Number.isFinite(candle.close) ||
      candle.close <= 0
    )
      continue;
    const key = monthKey(candle.time);
    if (!lastClose.has(key)) order.push(key);
    lastClose.set(key, { close: candle.close, date: candle.time });
  }
  order.sort();
  if (order.length < 2)
    throw new SeasonalityError(
      'Monthly returns need at least two calendar months of daily history.',
    );
  const currentMonth = monthKey(today);
  const first = order[0]!;
  const rows = new Map<number, YearRow>();
  const row = (year: number) => {
    let existing = rows.get(year);
    if (!existing) {
      existing = {
        year,
        months: Array.from({ length: 12 }, () => ({
          value: null,
          partial: false,
        })),
        total: null,
        partial: false,
      };
      rows.set(year, existing);
    }
    return existing;
  };
  for (const key of order) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const entry = row(year);
    const before = lastClose.get(previousMonthKey(key));
    const partial = key >= currentMonth;
    entry.months[month - 1] = {
      value:
        key === first || !before
          ? null
          : 100 * (lastClose.get(key)!.close / before.close - 1),
      partial,
    };
    if (partial) entry.partial = true;
  }
  const years = [...rows.values()].sort((a, b) => a.year - b.year);
  for (const entry of years) {
    // Year change needs the previous year's last close, so the first year has none.
    const end = [...order]
      .reverse()
      .find((key) => key.startsWith(`${entry.year}-`));
    const start = [...order]
      .reverse()
      .find((key) => key.startsWith(`${entry.year - 1}-`));
    if (end && start?.endsWith('-12'))
      entry.total =
        100 * (lastClose.get(end)!.close / lastClose.get(start)!.close - 1);
    // Data that stops before December leaves a year-to-date figure.
    if (!end || Number(end.slice(5, 7)) < 12) entry.partial = true;
  }
  const statistics = monthNames.map((_, month): MonthStatistics => {
    const values = years
      .map((entry) => entry.months[month]!)
      .filter(
        (cell): cell is MonthCell & { value: number } =>
          cell.value !== null && !cell.partial,
      )
      .map((cell) => cell.value);
    const enough = values.length >= minimumObservations;
    return {
      count: values.length,
      average: enough
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null,
      upShare: enough
        ? (100 * values.filter((value) => value > 0).length) / values.length
        : null,
    };
  });
  return {
    years,
    statistics,
    from: lastClose.get(first)!.date,
    to: lastClose.get(order.at(-1)!)!.date,
  };
}

/** A round colour scale (percent) that covers 90% of the readings. */
export const scaleSteps = [5, 10, 15, 20, 30, 50] as const;
export function colourScale(result: SeasonalityResult): number {
  const sizes = result.years
    .flatMap((entry) => entry.months)
    .filter((cell) => cell.value !== null)
    .map((cell) => Math.abs(cell.value!))
    .sort((a, b) => a - b);
  if (!sizes.length) return scaleSteps[0];
  const p90 =
    sizes[Math.min(sizes.length - 1, Math.floor(0.9 * sizes.length))]!;
  return scaleSteps.find((step) => step >= p90) ?? scaleSteps.at(-1)!;
}

/** Signed one-decimal percent without the % sign, using a true minus. */
export function formatReturn(value: number | null) {
  if (value === null) return '–';
  const text = Math.abs(value).toFixed(1);
  if (text === '0.0') return '0.0';
  return `${value < 0 ? '−' : '+'}${text}`;
}
export const formatShare = (value: number | null) =>
  value === null ? '–' : `${Math.round(value)}%`;
