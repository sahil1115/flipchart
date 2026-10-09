import type { Candle, TradingDate } from './types';

export class DataValidationError extends Error {
  constructor(
    public readonly row: number,
    reason: string,
  ) {
    super(`Row ${row}: ${reason}`);
    this.name = 'DataValidationError';
  }
}

export function isTradingDate(value: unknown): value is TradingDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Exact duplicates coalesce. Conflicting duplicates fail; sessions are never filled. */
export function normalizeCandles(rows: readonly Candle[]): Candle[] {
  const dates = new Map<TradingDate, Candle>();
  rows.forEach((row, index) => {
    const fail = (reason: string): never => {
      throw new DataValidationError(index + 1, reason);
    };
    if (!isTradingDate(row.time))
      fail('expected a real YYYY-MM-DD trading date.');
    if (![row.open, row.high, row.low, row.close].every(Number.isFinite))
      fail('OHLC prices must be finite numbers.');
    if (
      row.low > Math.min(row.open, row.close) ||
      row.high < Math.max(row.open, row.close) ||
      row.low > row.high
    )
      fail('low ≤ open/close ≤ high is required.');
    if (row.volume !== null && (!Number.isFinite(row.volume) || row.volume < 0))
      fail('volume must be a non-negative number or null.');
    if (row.incomplete !== undefined && typeof row.incomplete !== 'boolean')
      fail('incomplete must be a boolean when supplied.');
    const existing = dates.get(row.time);
    if (
      existing &&
      (['open', 'high', 'low', 'close', 'volume', 'incomplete'] as const).some(
        (key) => existing[key] !== row[key],
      )
    )
      fail(`conflicting duplicate date ${row.time}.`);
    dates.set(row.time, {
      time: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      ...(row.incomplete === undefined ? {} : { incomplete: row.incomplete }),
    });
  });
  return [...dates.values()].sort((a, b) => a.time.localeCompare(b.time));
}
