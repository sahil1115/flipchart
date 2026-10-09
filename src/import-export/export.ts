import Papa from 'papaparse';
import type { Dataset } from '../data/types';
import { validateDataset } from '../data/validate';
import { calculateDataset, validateParameters } from '../indicators/core';
import type { Parameters } from '../indicators/core';
import { definitions } from '../indicators/presentation';

export interface ExportWindow {
  from: number;
  to: number;
}
/** Text protection only: numeric negative values remain numbers. */
export function spreadsheetText(value: string | null | undefined): string {
  if (value == null) return '';
  return /^\s*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
}
export function exportDataset(
  input: Dataset,
  parameters: Parameters,
  window: ExportWindow | null = null,
) {
  const dataset = validateDataset(input);
  const error = validateParameters(parameters);
  if (error) throw new Error(error);
  const items = definitions(
    calculateDataset(dataset, parameters),
    parameters,
    dataset.metadata.interval,
  );
  const series = items.flatMap((item) =>
    item.series.map((output) => ({
      name: `${item.id}.${output.name}`,
      values: output.values,
    })),
  );
  const fields = [
    'date',
    'open',
    'high',
    'low',
    'close',
    'volume',
    'incomplete',
    'source_mode',
    'provider',
    'source',
    'symbol',
    'name',
    'exchange',
    'mic',
    'region',
    'currency',
    'timezone',
    'interval',
    'adjustment',
    'retrieved_at',
    'parameters_json',
    'aggregation',
    ...series.map((output) => output.name),
  ];
  const m = dataset.metadata,
    listing = m.listing;
  const metadata = {
    version: 1,
    dataset: m,
    parameters: { ...parameters },
    scope: window ? 'visible' : 'full',
    logicalWindow: window,
    conventions:
      'Finalized observed bars; full-history calculation before slicing; null warm-up/unavailable values are empty CSV fields; provisional bars retained with incomplete=true.',
    series: series.map((output) => output.name),
  };
  const data = dataset.candles.flatMap((bar, index) => {
    if (
      window &&
      (index < Math.ceil(window.from) || index > Math.floor(window.to))
    )
      return [];
    return [
      [
        bar.time,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
        bar.incomplete ?? false,
        ...[
          m.mode,
          m.provider,
          m.source,
          listing.symbol,
          listing.name,
          listing.exchange,
          listing.mic,
          listing.region,
          listing.currency,
          listing.timezone,
          m.interval,
          m.adjustment,
          m.retrievedAt,
          JSON.stringify(parameters),
          m.aggregation,
        ].map(spreadsheetText),
        ...series.map((output) => output.values[index]),
      ],
    ];
  });
  const safeSymbol =
    listing.symbol.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'dataset';
  return {
    csv: Papa.unparse({ fields, data }, { newline: '\r\n' }),
    metadata: JSON.stringify({ ...metadata, rows: data.length }, null, 2),
    filename: `flipchart-${safeSymbol}-${m.interval}-${window ? 'visible' : 'full'}`,
    rows: data.length,
  };
}
export function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
