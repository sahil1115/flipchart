import { expect, it } from 'vitest';
import Papa from 'papaparse';
import { createDemoDataset } from '../demo/dataset';
import { aggregateDaily } from '../data/aggregate';
import { defaults, calculateDataset } from '../indicators/core';
import { exportDataset, spreadsheetText } from './export';
it('round-trips all named outputs, missing warm-up and OHLCV at full precision with current parameters', () => {
  const dataset = createDemoDataset('2026-10-09T12:00:00Z');
  const parameters = { ...defaults, rsiPeriod: 7 };
  const output = exportDataset(dataset, parameters);
  const rows = Papa.parse<Record<string, string>>(output.csv, {
    header: true,
  }).data;
  expect(rows).toHaveLength(dataset.candles.length);
  expect(Object.keys(rows[0]!).filter((key) => key.includes('.'))).toHaveLength(
    24,
  );
  const rsiKey = Object.keys(rows[0]!).find((key) => key.startsWith('rsi.'))!;
  expect(rows[0]![rsiKey]).toBe('');
  const calculated = calculateDataset(dataset, parameters);
  rows.forEach((row, index) => {
    expect(Number(row.close)).toBe(dataset.candles[index]!.close);
    expect(row[rsiKey]).toBe(
      calculated.rsi[index] === null ? '' : String(calculated.rsi[index]),
    );
  });
  expect(JSON.parse(rows[0]!.parameters_json!)).toEqual(parameters);
  expect(JSON.parse(output.metadata)).toMatchObject({
    scope: 'full',
    rows: 780,
    dataset: { mode: 'demo', adjustment: 'synthetic' },
  });
});
it('slices actual logical view after calculating full history, including weekly/monthly annualization and provisional gaps', () => {
  for (const interval of ['weekly', 'monthly'] as const) {
    const dataset = aggregateDaily(
      createDemoDataset('2026-10-09T12:00:00Z'),
      interval,
    );
    const full = Papa.parse<Record<string, string>>(
      exportDataset(dataset, defaults).csv,
      { header: true },
    ).data;
    const partial = exportDataset(dataset, defaults, { from: 10.2, to: 15.8 });
    const sliced = Papa.parse<Record<string, string>>(partial.csv, {
      header: true,
    }).data;
    expect(sliced).toEqual(full.slice(11, 16));
    expect(sliced[0]!.interval).toBe(interval);
    expect(JSON.parse(partial.metadata)).toMatchObject({
      scope: 'visible',
      rows: 5,
    });
  }
});
it('properly escapes imported spreadsheet text, quotes and commas while preserving numeric negatives', () => {
  const dataset = createDemoDataset('2026-10-09T12:00:00Z');
  dataset.metadata.listing.symbol = '=SUM(1,2)';
  dataset.metadata.listing.name = ' +cmd,"quoted"';
  const rows = Papa.parse<Record<string, string>>(
    exportDataset(dataset, defaults).csv,
    { header: true },
  ).data;
  expect(rows[0]!.symbol).toBe("'=SUM(1,2)");
  expect(rows[0]!.name).toBe('\'+cmd,"quoted"');
  for (const value of ['=x', ' +x', '-x', '@x', '\tx', '\nx'])
    expect(spreadsheetText(value)).toBe(`'${value}`);
  expect(spreadsheetText('plain')).toBe('plain');
  expect(Object.values(rows.at(-1)!).some((value) => /^-\d/.test(value))).toBe(
    true,
  );
});
