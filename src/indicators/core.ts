import type { Candle, Dataset, TradingDate } from '../data/types';
import {
  stochastic,
  directional,
  cci,
  williams,
  roc,
  historicalVolatility,
  annualization,
} from './extended';

export type Values = (number | null)[];
export interface Parameters {
  smaShort: number;
  smaMedium: number;
  smaLong: number;
  emaFast: number;
  emaSlow: number;
  bbPeriod: number;
  bbDeviation: number;
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atrPeriod: number;
  volumePeriod: number;
  stochasticPeriod: number;
  stochasticK: number;
  stochasticD: number;
  adxPeriod: number;
  cciPeriod: number;
  williamsPeriod: number;
  rocPeriod: number;
  volatilityPeriod: number;
}
export const defaults: Parameters = {
  smaShort: 20,
  smaMedium: 50,
  smaLong: 200,
  emaFast: 12,
  emaSlow: 26,
  bbPeriod: 20,
  bbDeviation: 2,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  atrPeriod: 14,
  volumePeriod: 20,
  stochasticPeriod: 14,
  stochasticK: 3,
  stochasticD: 3,
  adxPeriod: 14,
  cciPeriod: 20,
  williamsPeriod: 14,
  rocPeriod: 12,
  volatilityPeriod: 20,
};
export function validateParameters(parameters: Parameters): string | null {
  for (const [name, value] of Object.entries(parameters)) {
    if (name === 'bbDeviation') {
      if (!Number.isFinite(value) || value <= 0 || value > 10)
        return 'Band deviation must be greater than 0 and at most 10.';
    } else if (!Number.isInteger(value) || value < 2 || value > 5000) {
      return 'Periods must be whole numbers from 2 to 5,000.';
    }
  }
  if (parameters.macdFast >= parameters.macdSlow)
    return 'MACD fast period must be smaller than slow period.';
  if (parameters.emaFast >= parameters.emaSlow)
    return 'EMA fast period must be smaller than slow period.';
  if (
    parameters.smaShort >= parameters.smaMedium ||
    parameters.smaMedium >= parameters.smaLong
  )
    return 'SMA periods must increase from short to medium to long.';
  return null;
}
function periodCheck(period: number) {
  if (!Number.isInteger(period) || period < 2 || period > 5000)
    throw new RangeError('Period must be an integer from 2 to 5000.');
}
const finite = (value: number): number | null =>
  Number.isFinite(value) ? value : null;
export function sma(input: readonly (number | null)[], period: number): Values {
  periodCheck(period);
  let sum = 0,
    missing = 0;
  return input.map((value, index) => {
    if (value === null) missing++;
    else sum += value;
    if (index >= period) {
      const old = input[index - period]!;
      if (old === null) missing--;
      else sum -= old;
    }
    return index >= period - 1 && missing === 0 ? finite(sum / period) : null;
  });
}
/** SMA seed at seedIndex; recursive alpha=2/(period+1). */
export function ema(
  input: readonly number[],
  period: number,
  seedIndex = period - 1,
): Values {
  periodCheck(period);
  if (!Number.isInteger(seedIndex) || seedIndex < period - 1)
    throw new RangeError('EMA seed index must cover a complete period.');
  const result: Values = input.map(() => null);
  if (seedIndex >= input.length) return result;
  let value =
    input
      .slice(seedIndex - period + 1, seedIndex + 1)
      .reduce((a, b) => a + b, 0) / period;
  result[seedIndex] = finite(value);
  const alpha = 2 / (period + 1);
  for (let i = seedIndex + 1; i < input.length; i++) {
    value += alpha * (input[i]! - value);
    result[i] = finite(value);
  }
  return result;
}
export function bollinger(
  input: readonly number[],
  period: number,
  deviation: number,
) {
  periodCheck(period);
  if (!Number.isFinite(deviation) || deviation <= 0 || deviation > 10)
    throw new RangeError('Invalid band deviation.');
  const middle = sma(input, period),
    upper: Values = input.map(() => null),
    lower: Values = [...upper];
  // Centered two-pass population variance avoids cancellation for high prices.
  for (let i = period - 1; i < input.length; i++) {
    const mean = middle[i]!;
    if (mean === null) continue;
    let squared = 0;
    for (let j = i - period + 1; j <= i; j++)
      squared += (input[j]! - mean) ** 2;
    const width = deviation * Math.sqrt(squared / period);
    upper[i] = finite(mean + width);
    lower[i] = finite(mean - width);
  }
  return { middle, upper, lower };
}
export function rsi(input: readonly number[], period: number): Values {
  periodCheck(period);
  const result: Values = input.map(() => null);
  if (input.length <= period) return result;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = input[i]! - input[i - 1]!;
    gain += Math.max(delta, 0);
    loss += Math.max(-delta, 0);
  }
  gain /= period;
  loss /= period;
  for (let i = period; i < input.length; i++) {
    if (i > period) {
      const delta = input[i]! - input[i - 1]!;
      gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
    }
    result[i] = gain + loss === 0 ? 0 : finite((100 * gain) / (gain + loss));
  }
  return result;
}
export function atr(candles: readonly Candle[], period: number): Values {
  periodCheck(period);
  const result: Values = candles.map(() => null);
  let average = 0;
  for (let i = 1; i < candles.length; i++) {
    const bar = candles[i]!,
      previous = candles[i - 1]!;
    const tr = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previous.close),
      Math.abs(bar.low - previous.close),
    );
    if (i <= period) average += tr / period;
    else average = (average * (period - 1) + tr) / period;
    if (i >= period) result[i] = finite(average);
  }
  return result;
}
export function macd(
  input: readonly number[],
  fast: number,
  slow: number,
  signalPeriod: number,
) {
  [fast, slow, signalPeriod].forEach(periodCheck);
  if (fast >= slow)
    throw new RangeError('MACD fast must be smaller than slow.');
  // TA-Lib convention: both EMA seeds end at slow-1, then signal SMA seed.
  const fastValues = ema(input, fast, slow - 1),
    slowValues = ema(input, slow);
  const raw = input.map((_, i) =>
    fastValues[i] === null || slowValues[i] === null
      ? null
      : finite(fastValues[i]! - slowValues[i]!),
  );
  const offset = slow - 1;
  const signalInput = raw.slice(offset).map((value) => value ?? NaN);
  const signalTail = ema(signalInput, signalPeriod);
  const signal: Values = input.map((_, i) =>
    i < offset ? null : (signalTail[i - offset] ?? null),
  );
  const line: Values = raw.map((value, i) =>
    signal[i] === null ? null : value,
  );
  const histogram = line.map((value, i) =>
    value === null || signal[i] === null ? null : finite(value - signal[i]!),
  );
  return { line, signal, histogram };
}
export function obv(candles: readonly Candle[]): Values {
  let total: number | null = 0;
  return candles.map((bar, i) => {
    if (bar.volume === null) total = null;
    if (total === null) return null;
    if (i === 0) total = bar.volume!;
    else if (bar.close !== candles[i - 1]!.close)
      total += bar.close > candles[i - 1]!.close ? bar.volume! : -bar.volume!;
    return finite(total);
  });
}
export interface Outputs {
  smaShort: Values;
  smaMedium: Values;
  smaLong: Values;
  emaFast: Values;
  emaSlow: Values;
  volumeAverage: Values;
  bollinger: { middle: Values; upper: Values; lower: Values };
  rsi: Values;
  atr: Values;
  obv: Values;
  macd: { line: Values; signal: Values; histogram: Values };
  stochastic: { k: Values; d: Values };
  directional: { plus: Values; minus: Values; adx: Values };
  cci: Values;
  williams: Values;
  roc: Values;
  volatility: Values;
}
export function calculate(
  candles: readonly Candle[],
  parameters: Parameters,
  interval: Dataset['metadata']['interval'] = 'daily',
): Outputs {
  const error = validateParameters(parameters);
  if (error) throw new RangeError(error);
  const finalized = candles.filter((bar) => !bar.incomplete);
  const close = finalized.map((bar) => bar.close);
  const align = (values: Values): Values => {
    let index = 0;
    return candles.map((bar) =>
      bar.incomplete ? null : (values[index++] ?? null),
    );
  };
  const bands = bollinger(close, parameters.bbPeriod, parameters.bbDeviation);
  const moving = macd(
    close,
    parameters.macdFast,
    parameters.macdSlow,
    parameters.macdSignal,
  );
  const slow = stochastic(
    finalized,
    parameters.stochasticPeriod,
    parameters.stochasticK,
    parameters.stochasticD,
  );
  const movement = directional(finalized, parameters.adxPeriod);
  return {
    smaShort: align(sma(close, parameters.smaShort)),
    smaMedium: align(sma(close, parameters.smaMedium)),
    smaLong: align(sma(close, parameters.smaLong)),
    emaFast: align(ema(close, parameters.emaFast)),
    emaSlow: align(ema(close, parameters.emaSlow)),
    volumeAverage: align(
      sma(
        finalized.map((bar) => bar.volume),
        parameters.volumePeriod,
      ),
    ),
    bollinger: {
      middle: align(bands.middle),
      upper: align(bands.upper),
      lower: align(bands.lower),
    },
    rsi: align(rsi(close, parameters.rsiPeriod)),
    atr: align(atr(finalized, parameters.atrPeriod)),
    obv: align(obv(finalized)),
    macd: {
      line: align(moving.line),
      signal: align(moving.signal),
      histogram: align(moving.histogram),
    },
    stochastic: { k: align(slow.k), d: align(slow.d) },
    directional: {
      plus: align(movement.plus),
      minus: align(movement.minus),
      adx: align(movement.adx),
    },
    cci: align(cci(finalized, parameters.cciPeriod)),
    williams: align(williams(finalized, parameters.williamsPeriod)),
    roc: align(roc(close, parameters.rocPeriod)),
    volatility: align(
      historicalVolatility(
        close,
        parameters.volatilityPeriod,
        annualization[interval],
      ),
    ),
  };
}
const cache = new WeakMap<
  Dataset,
  { revision: string; entries: Map<string, Outputs> }
>();
export function calculateDataset(
  dataset: Dataset,
  parameters: Parameters,
): Outputs {
  let record = cache.get(dataset);
  if (!record || record.revision !== dataset.metadata.revision) {
    record = { revision: dataset.metadata.revision, entries: new Map() };
    cache.set(dataset, record);
  }
  const key = JSON.stringify(parameters);
  let result = record.entries.get(key);
  if (!result) {
    result = calculate(dataset.candles, parameters, dataset.metadata.interval);
    if (record.entries.size >= 8)
      record.entries.delete(record.entries.keys().next().value!);
    record.entries.set(key, result);
  }
  return result;
}
export function latestValue(
  candles: readonly Candle[],
  values: Values,
): { time: TradingDate; value: number } | null {
  for (let i = values.length - 1; i >= 0; i--)
    if (values[i] !== null && values[i] !== undefined)
      return { time: candles[i]!.time, value: values[i]! };
  return null;
}
