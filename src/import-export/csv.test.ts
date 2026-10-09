import { describe, expect, it } from 'vitest';
import {
  CsvImportError,
  CSV_TEMPLATE,
  importCsv,
  MAX_FILE_BYTES,
  parseCsv,
  suggestMapping,
} from './csv';
import type { ImportOptions } from './csv';
const options: ImportOptions = {
  symbol: 'TEST',
  name: 'Test, Inc.',
  exchange: '',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  adjustment: 'raw',
  dateFormat: 'iso-date',
  numberFormat: 'dot',
};
function convert(
  csv: string,
  overrides: Partial<ImportOptions> = {},
  delimiter = ',',
) {
  const parsed = parseCsv(csv, delimiter);
  return importCsv(
    parsed,
    suggestMapping(parsed.headers),
    { ...options, ...overrides },
    'own.csv',
    'fixture-id',
    '2026-10-09T00:00:00Z',
  );
}
const header = 'date,open,high,low,close,volume\n';
describe('CSV import', () => {
  it('sorts unsorted records and preserves unknown/zero volume without guessing extra columns', () => {
    const result = convert(
      'Date,open,high,low,close,volume,notes\n2024-01-03,12,14,11,13,0,"Company, Inc. says ""hello"""\n2024-01-02,10,13,9,12,,"multiline\nquoted field"',
    );
    expect(result.dataset.candles).toEqual([
      {
        time: '2024-01-02',
        open: 10,
        high: 13,
        low: 9,
        close: 12,
        volume: null,
        incomplete: false,
      },
      {
        time: '2024-01-03',
        open: 12,
        high: 14,
        low: 11,
        close: 13,
        volume: 0,
        incomplete: false,
      },
    ]);
    expect(result.dataset.metadata).toMatchObject({
      id: 'import:fixture-id:daily',
      mode: 'import',
      provider: null,
      adjustment: 'raw',
      listing: { currency: 'INR', exchange: null },
    });
    expect(result.warnings.join(' ')).toContain('unknown volume');
    expect(JSON.stringify(result.dataset)).not.toContain('multiline');
  });
  it('accepts the template and a file without any volume column', () => {
    expect(convert(CSV_TEMPLATE).dataset.candles).toHaveLength(2);
    expect(
      convert('date,open,high,low,close\n2024-01-02,10,13,9,12').dataset
        .candles[0]?.volume,
    ).toBeNull();
  });
  it('allows explicit remapping of nonstandard headers', () => {
    const parsed = parseCsv(
      'Session,Opening,Max,Min,Last\n2024-01-02,10,13,9,12',
    );
    const result = importCsv(
      parsed,
      { date: 0, open: 1, high: 2, low: 3, close: 4, volume: -1 },
      options,
      'custom.csv',
      'map',
      '2026-10-09T00:00:00Z',
    );
    expect(result.dataset.candles[0]?.close).toBe(12);
  });
  it.each(['2024-02-30', '02/03/2024', '2024-2-3'])(
    'rejects ambiguous/invalid dates %s with source record feedback',
    (date) => {
      expect(() => convert(header + date + ',10,13,9,12,1')).toThrow(
        'CSV record 2',
      );
    },
  );
  it('resolves slash dates only with the declared format', () => {
    const text = header + '02/03/2024,10,13,9,12,1';
    expect(
      convert(text, { dateFormat: 'day-first' }).dataset.candles[0]?.time,
    ).toBe('2024-03-02');
    expect(
      convert(text, { dateFormat: 'month-first' }).dataset.candles[0]?.time,
    ).toBe('2024-02-03');
  });
  it('preserves date-only identity and explicitly converts offset timestamps to the exchange date', () => {
    expect(
      convert(header + '2024-01-02,10,13,9,12,1', {
        timezone: 'America/Los_Angeles',
      }).dataset.candles[0]?.time,
    ).toBe('2024-01-02');
    expect(
      convert(header + '2024-01-02T00:30:00Z,10,13,9,12,1', {
        dateFormat: 'iso-timestamp',
        timezone: 'America/New_York',
      }).dataset.candles[0]?.time,
    ).toBe('2024-01-01');
    expect(() =>
      convert(header + '2024-01-02T00:30:00,10,13,9,12,1', {
        dateFormat: 'iso-timestamp',
      }),
    ).toThrow('explicit offset');
    expect(() =>
      convert(header + '2024-01-02T24:00:00Z,10,13,9,12,1', {
        dateFormat: 'iso-timestamp',
      }),
    ).toThrow('CSV record 2');
  });
  it('never guesses decimal/thousands conventions', () => {
    expect(() =>
      convert(header + '2024-01-02,"1,234",1300,1200,1250,1'),
    ).toThrow('without thousands');
    expect(
      convert(
        'date;open;high;low;close;volume\n2024-01-02;10,5;13,5;9,5;12,5;1',
        { numberFormat: 'comma' },
        ';',
      ).dataset.candles[0]?.open,
    ).toBe(10.5);
    expect(() => convert(header + '2024-01-02,1e2,130,90,120,1')).toThrow(
      'scientific notation',
    );
  });
  it.each([
    '2024-01-02,10,9,8,12,1',
    '2024-01-02,NaN,13,9,12,1',
    '2024-01-02,10,13,9,12,-1',
  ])('rejects material errors %s', (row) =>
    expect(() => convert(header + row)).toThrow('CSV record 2'),
  );
  it('coalesces exact duplicates and rejects conflicting duplicates at the actual source record', () => {
    const row = '2024-01-02,10,13,9,12,1';
    const result = convert(header + row + '\n\n' + row);
    expect(result.dataset.candles).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('duplicate');
    expect(() => convert(header + row + '\n\n2024-01-02,10,13,9,11,1')).toThrow(
      'CSV record 4: conflicting duplicate',
    );
  });
  it.each([
    { currency: '' },
    { timezone: '' },
    { timezone: 'Unknown/Place' },
    { symbol: '' },
  ])('requires actionable metadata %j', (overrides) =>
    expect(() => convert(CSV_TEMPLATE, overrides)).toThrow(CsvImportError),
  );
  it('rejects malformed quoted CSV, duplicate headers and mismatched fields', () => {
    expect(() => parseCsv(header + '"unfinished')).toThrow(CsvImportError);
    expect(() =>
      parseCsv('date,open,high,low,close,close\n2024-01-02,10,13,9,12,1'),
    ).toThrow('unique');
    expect(() => parseCsv(header + '2024-01-02,10,13,9,12')).toThrow(
      'CSV record 2',
    );
  });
  it('handles at least 5,000 daily bars', () => {
    const rows = Array.from(
      { length: 5000 },
      (_, i) =>
        new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10) +
        ',10,13,9,12,100',
    );
    expect(
      convert(header + rows.reverse().join('\n')).dataset.candles,
    ).toHaveLength(5000);
  });
  it('marks the last chronological bar incomplete only when explicitly declared', () => {
    const result = convert(
      header + '2024-01-03,12,14,11,13,20\n2024-01-02,10,13,9,12,10',
      { trailingIncomplete: true },
    );
    expect(result.dataset.candles.map((candle) => candle.incomplete)).toEqual([
      false,
      true,
    ]);
    expect(result.warnings.join(' ')).toContain('provisional');
  });
  it('enforces file and record limits', () => {
    expect(() => parseCsv('x'.repeat(MAX_FILE_BYTES + 1))).toThrow('10 MiB');
    expect(() =>
      parseCsv(header + '2024-01-02,10,13,9,12,1\n'.repeat(50_001)),
    ).toThrow('limit');
  });
});
