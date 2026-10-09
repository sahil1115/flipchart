import type { Candle } from '../data/types';
import type { Values } from './core';
const checked = (period: number) => {
  if (!Number.isInteger(period) || period < 2 || period > 5000)
    throw new RangeError('Period must be an integer from 2 to 5000.');
};
const finite = (value: number): number | null =>
  Number.isFinite(value) ? value : null;
function mean(input: Values, period: number): Values {
  return input.map((_, i) => {
    if (i < period - 1) return null;
    const window = input.slice(i - period + 1, i + 1);
    return window.some((value) => value === null)
      ? null
      : finite(window.reduce<number>((sum, value) => sum + value!, 0) / period);
  });
}
export function stochastic(
  bars: readonly Candle[],
  period: number,
  smoothK: number,
  smoothD: number,
) {
  [period, smoothK, smoothD].forEach(checked);
  const fast: Values = bars.map((bar, i) => {
    if (i < period - 1) return null;
    const window = bars.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map((row) => row.high)),
      low = Math.min(...window.map((row) => row.low));
    return high === low ? 0 : finite((100 * (bar.close - low)) / (high - low));
  });
  const rawK = mean(fast, smoothK),
    d = mean(rawK, smoothD);
  // TA-Lib STOCH exposes both outputs from the slow-D start date.
  return { k: rawK.map((value, i) => (d[i] === null ? null : value)), d };
}
export function directional(bars: readonly Candle[], period: number) {
  checked(period);
  const plus: Values = bars.map(() => null),
    minus: Values = [...plus],
    adx: Values = [...plus];
  let upSum = 0,
    downSum = 0,
    rangeSum = 0,
    dxSum = 0,
    average = 0;
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!,
      previous = bars[i - 1]!;
    const up = bar.high - previous.high,
      down = previous.low - bar.low;
    const upMove = up > 0 && up > down ? up : 0,
      downMove = down > 0 && down > up ? down : 0;
    const range = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previous.close),
      Math.abs(bar.low - previous.close),
    );
    if (i < period) {
      upSum += upMove;
      downSum += downMove;
      rangeSum += range;
      continue;
    }
    upSum = upSum - upSum / period + upMove;
    downSum = downSum - downSum / period + downMove;
    rangeSum = rangeSum - rangeSum / period + range;
    const p = rangeSum === 0 ? 0 : (100 * upSum) / rangeSum,
      m = rangeSum === 0 ? 0 : (100 * downSum) / rangeSum;
    plus[i] = finite(p);
    minus[i] = finite(m);
    const dx = p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
    if (i < 2 * period) {
      dxSum += dx;
      if (i === 2 * period - 1) {
        average = dxSum / period;
        adx[i] = finite(average);
      }
    } else {
      average = (average * (period - 1) + dx) / period;
      adx[i] = finite(average);
    }
  }
  return { plus, minus, adx };
}
export function cci(bars: readonly Candle[], period: number): Values {
  checked(period);
  const typical = bars.map((bar) => bar.high / 3 + bar.low / 3 + bar.close / 3);
  return typical.map((value, i) => {
    if (i < period - 1) return null;
    const window = typical.slice(i - period + 1, i + 1);
    const base = window[0]!;
    const average =
      base + window.reduce((sum, row) => sum + (row - base) / period, 0);
    const deviation = window.reduce(
      (sum, row) => sum + Math.abs(row - average) / period,
      0,
    );
    return deviation === 0
      ? 0
      : finite((value - average) / (0.015 * deviation));
  });
}
export function williams(bars: readonly Candle[], period: number): Values {
  checked(period);
  return bars.map((bar, i) => {
    if (i < period - 1) return null;
    const window = bars.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map((row) => row.high)),
      low = Math.min(...window.map((row) => row.low));
    return high === low
      ? 0
      : finite((-100 * (high - bar.close)) / (high - low));
  });
}
export function roc(input: readonly number[], period: number): Values {
  checked(period);
  return input.map((value, i) =>
    i < period || input[i - period] === 0
      ? null
      : finite(100 * (value / input[i - period]! - 1)),
  );
}
export const annualization = { daily: 252, weekly: 52, monthly: 12 } as const;
export function historicalVolatility(
  input: readonly number[],
  period: number,
  factor: number,
): Values {
  checked(period);
  if (!Number.isFinite(factor) || factor <= 0)
    throw new RangeError('Annualization factor must be positive.');
  const returns = input.map((value, i) =>
    i === 0 || value <= 0 || input[i - 1]! <= 0
      ? null
      : finite(Math.log(value) - Math.log(input[i - 1]!)),
  );
  return input.map((_, i) => {
    if (i < period) return null;
    const window = returns.slice(i - period + 1, i + 1);
    if (window.some((value) => value === null)) return null;
    const average = window.reduce<number>(
      (sum, value) => sum + value! / period,
      0,
    );
    const squared = window.reduce<number>(
      (sum, value) => sum + (value! - average) ** 2,
      0,
    );
    return finite(100 * Math.sqrt(squared / (period - 1)) * Math.sqrt(factor));
  });
}
