import type { IndicatorDefinition } from '../../indicators/presentation';

export function formatValue(
  value: number,
  units: IndicatorDefinition['units'],
) {
  return value
    .toLocaleString('en-US', {
      notation: units === 'volume' ? 'compact' : 'standard',
      maximumFractionDigits:
        units === 'volume' || units === 'price' || units === 'percent' ? 2 : 1,
    })
    .replace('-', '−');
}

export function valueUnit(
  units: IndicatorDefinition['units'],
  currency: string | null,
) {
  return units === 'price'
    ? (currency ?? 'Price units')
    : units === 'volume'
      ? 'volume'
      : units === 'percent'
        ? '%'
        : 'index';
}

export const paneLabels: Record<string, string> = {
  rsi: 'RSI',
  macd: 'MACD',
  stochastic: 'Stoch',
  adx: 'ADX',
  cci: 'CCI',
  williams: '%R',
  roc: 'ROC',
  atr: 'ATR',
  volatility: 'HV',
  obv: 'OBV',
};
