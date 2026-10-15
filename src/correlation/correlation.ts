import type { TradingDate } from '../data/types';
import type { CloseSeries } from './history';

export type Basis = 'returns' | 'prices';
export type Period = 15 | 30;

export interface CorrelationResult {
  symbols: string[];
  /** Pearson coefficients; null where a series has no variation. */
  matrix: (number | null)[][];
  basis: Basis;
  period: Period;
  /** Sessions whose closes were used (returns need one extra leading close). */
  dates: TradingDate[];
  observations: number;
}

export class InsufficientHistoryError extends Error {
  constructor(
    public readonly available: number,
    public readonly required: number,
  ) {
    super(
      `Only ${available} sessions are shared by every stock; ${required} are needed. Try the 15-day period or remove a stock with gaps.`,
    );
    this.name = 'InsufficientHistoryError';
  }
}

/** Pearson correlation with centered sums; null if either series is constant. */
export function pearson(x: readonly number[], y: readonly number[]) {
  if (x.length !== y.length || x.length < 2)
    throw new RangeError('Series must align and contain at least two values.');
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(x),
    my = mean(y);
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i]! - mx,
      dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/**
 * Uses only sessions every stock traded, so each pair sees the same dates.
 * Returns are simple daily returns (close / previous close − 1). Price
 * correlation is offered for comparison but is inflated by shared trends.
 */
export function correlationMatrix(
  series: readonly CloseSeries[],
  period: Period,
  basis: Basis,
): CorrelationResult {
  if (series.length < 2)
    throw new RangeError('At least two stocks are needed for a correlation.');
  const common = [...series[0]!.closes.keys()]
    .filter((date) => series.every((item) => item.closes.has(date)))
    .sort();
  const required = basis === 'returns' ? period + 1 : period;
  if (common.length < required)
    throw new InsufficientHistoryError(common.length, required);
  const dates = common.slice(-required);
  const values = series.map((item) => {
    const closes = dates.map((date) => item.closes.get(date)!);
    return basis === 'returns'
      ? closes.slice(1).map((close, i) => close / closes[i]! - 1)
      : closes;
  });
  const matrix = values.map((row, i) =>
    values.map((column, j) =>
      i === j
        ? pearson(row, row) === null
          ? null
          : 1
        : j < i
          ? null
          : pearson(row, column),
    ),
  );
  // Fill the lower triangle from the upper one so the matrix is exactly symmetric.
  matrix.forEach((row, i) =>
    row.forEach((_, j) => {
      if (j < i) row[j] = matrix[j]![i]!;
    }),
  );
  return {
    symbols: series.map((item) => item.symbol),
    matrix,
    basis,
    period,
    dates,
    observations: values[0]!.length,
  };
}
