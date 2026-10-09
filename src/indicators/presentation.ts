import type { Outputs, Parameters, Values } from './core';
import type { Dataset } from '../data/types';
import { annualization } from './extended';
export type IndicatorId =
  | 'sma'
  | 'ema'
  | 'bands'
  | 'rsi'
  | 'macd'
  | 'atr'
  | 'obv'
  | 'volumeAverage'
  | 'stochastic'
  | 'adx'
  | 'cci'
  | 'williams'
  | 'roc'
  | 'volatility';
export type Visibility = Record<IndicatorId, boolean>;
export const defaultVisibility: Visibility = {
  sma: true,
  ema: false,
  bands: false,
  rsi: true,
  macd: true,
  atr: true,
  obv: false,
  volumeAverage: true,
  stochastic: false,
  adx: false,
  cci: false,
  williams: false,
  roc: false,
  volatility: false,
};
export interface IndicatorDefinition {
  id: IndicatorId;
  name: string;
  group: 'Price & Trend' | 'Momentum' | 'Volatility' | 'Volume';
  units:
    'price' | 'index' | 'volume' | 'percent' | 'unbounded' | 'negative-index';
  guides?: number[];
  formula: string;
  required: number;
  series: {
    name: string;
    values: Values;
    histogram?: boolean;
    required?: number;
  }[];
}
export function definitions(
  o: Outputs,
  p: Parameters,
  interval: Dataset['metadata']['interval'] = 'daily',
): IndicatorDefinition[] {
  return [
    {
      id: 'sma',
      name: 'SMA',
      group: 'Price & Trend',
      units: 'price',
      formula: 'Arithmetic mean of the last N finalized closes.',
      required: p.smaLong,
      series: [
        { name: `SMA ${p.smaShort}`, values: o.smaShort, required: p.smaShort },
        {
          name: `SMA ${p.smaMedium}`,
          values: o.smaMedium,
          required: p.smaMedium,
        },
        { name: `SMA ${p.smaLong}`, values: o.smaLong, required: p.smaLong },
      ],
    },
    {
      id: 'ema',
      name: 'EMA',
      group: 'Price & Trend',
      units: 'price',
      formula:
        'Seeded with N-close SMA, then previous EMA + 2/(N+1) × (close − previous EMA).',
      required: p.emaSlow,
      series: [
        { name: `EMA ${p.emaFast}`, values: o.emaFast, required: p.emaFast },
        { name: `EMA ${p.emaSlow}`, values: o.emaSlow, required: p.emaSlow },
      ],
    },
    {
      id: 'bands',
      name: 'Bollinger Bands',
      group: 'Price & Trend',
      units: 'price',
      formula: `${p.bbPeriod}-close SMA ± ${p.bbDeviation} × population standard deviation.`,
      required: p.bbPeriod,
      series: [
        { name: 'Band middle', values: o.bollinger.middle },
        { name: 'Band upper', values: o.bollinger.upper },
        { name: 'Band lower', values: o.bollinger.lower },
      ],
    },
    {
      id: 'rsi',
      guides: [30, 70],
      name: `RSI ${p.rsiPeriod}`,
      group: 'Momentum',
      units: 'index',
      formula:
        '100 × Wilder average gain / (average gain + average loss). Seed: N changes; alpha 1/N. Flat series is 0.',
      required: p.rsiPeriod + 1,
      series: [{ name: 'RSI', values: o.rsi }],
    },
    {
      id: 'macd',
      guides: [0],
      name: `MACD ${p.macdFast}, ${p.macdSlow}, ${p.macdSignal}`,
      group: 'Momentum',
      units: 'price',
      formula:
        'Fast EMA − slow EMA; signal is an SMA-seeded EMA of that difference; histogram = line − signal. Both price seeds end at the slow-period seed date.',
      required: p.macdSlow + p.macdSignal - 1,
      series: [
        { name: 'MACD line', values: o.macd.line },
        { name: 'MACD signal', values: o.macd.signal },
        { name: 'MACD histogram', values: o.macd.histogram, histogram: true },
      ],
    },
    {
      id: 'atr',
      name: `ATR ${p.atrPeriod}`,
      group: 'Volatility',
      units: 'price',
      formula:
        'Wilder average of max(high−low, |high−previous close|, |low−previous close|). Seed: N true ranges after the first bar.',
      required: p.atrPeriod + 1,
      series: [{ name: 'ATR', values: o.atr }],
    },
    {
      id: 'stochastic',
      name: `Slow stochastic ${p.stochasticPeriod}, ${p.stochasticK}, ${p.stochasticD}`,
      group: 'Momentum',
      units: 'index',
      guides: [20, 80],
      formula:
        'Fast %K = 100 × (close − lowest low)/(highest high − lowest low) over N bars; slow %K and %D use SMA smoothing. Zero range is 0; both outputs start with slow %D. Reference lines are neutral scale guides.',
      required: p.stochasticPeriod + p.stochasticK + p.stochasticD - 2,
      series: [
        { name: 'Slow %K', values: o.stochastic.k },
        { name: 'Slow %D', values: o.stochastic.d },
      ],
    },
    {
      id: 'adx',
      name: `ADX / +DI / −DI ${p.adxPeriod}`,
      group: 'Price & Trend',
      units: 'index',
      guides: [25],
      formula:
        'Directional movement selects the larger positive high/low extension (ties are zero). Wilder smoothed movement / true range × 100 gives DI. ADX is Wilder average DX = 100 × |+DI − −DI|/(+DI + −DI); zero denominators give 0. N−1 movement seed, first DI at N and first ADX at 2N−1.',
      required: 2 * p.adxPeriod,
      series: [
        { name: 'ADX', values: o.directional.adx },
        { name: '+DI', values: o.directional.plus, required: p.adxPeriod + 1 },
        { name: '−DI', values: o.directional.minus, required: p.adxPeriod + 1 },
      ],
    },
    {
      id: 'cci',
      name: `CCI ${p.cciPeriod}`,
      group: 'Momentum',
      units: 'unbounded',
      guides: [-100, 0, 100],
      formula:
        '(Typical price − its N-bar mean)/(0.015 × mean absolute deviation); typical price = (high + low + close)/3. Zero deviation is 0. No bounded index range is assumed.',
      required: p.cciPeriod,
      series: [{ name: 'CCI', values: o.cci }],
    },
    {
      id: 'williams',
      name: `Williams %R ${p.williamsPeriod}`,
      group: 'Momentum',
      units: 'negative-index',
      guides: [-80, -20],
      formula:
        '−100 × (highest high − close)/(highest high − lowest low), using N bars. Zero range is 0. Neutral reference lines carry no trade interpretation.',
      required: p.williamsPeriod,
      series: [{ name: 'Williams %R', values: o.williams }],
    },
    {
      id: 'roc',
      name: `ROC ${p.rocPeriod}`,
      group: 'Momentum',
      units: 'percent',
      guides: [0],
      formula:
        '100 × (close / close N bars earlier − 1). Requires N changes plus a starting close. Zero denominator is unavailable.',
      required: p.rocPeriod + 1,
      series: [{ name: 'ROC %', values: o.roc }],
    },
    {
      id: 'volatility',
      name: `Historical volatility ${p.volatilityPeriod}`,
      group: 'Volatility',
      units: 'percent',
      formula: `Sample standard deviation (N−1 denominator) of ${p.volatilityPeriod} log returns × √${annualization[interval]} × 100. Annualization approximates ${annualization[interval]} ${interval} bars/year. Non-positive closes make affected return windows unavailable.`,
      required: p.volatilityPeriod + 1,
      series: [{ name: 'Annualized volatility %', values: o.volatility }],
    },
    {
      id: 'obv',
      name: 'OBV',
      group: 'Volume',
      units: 'volume',
      formula:
        'Starts at first finalized volume; adds/subtracts current volume when close rises/falls, unchanged on equal close. Unknown volume makes the cumulative total unavailable from that point.',
      required: 1,
      series: [{ name: 'OBV', values: o.obv }],
    },
    {
      id: 'volumeAverage',
      name: `Volume SMA ${p.volumePeriod}`,
      group: 'Volume',
      units: 'volume',
      formula:
        'Arithmetic mean of N known finalized volumes. Any unknown volume makes that window unavailable; later complete windows recover.',
      required: p.volumePeriod,
      series: [{ name: 'Volume average', values: o.volumeAverage }],
    },
  ];
}
