import Papa from 'papaparse';
import {
  DataValidationError,
  isTradingDate,
  normalizeCandles,
} from '../data/normalize';
import type { Candle, Dataset, TradingDate } from '../data/types';
import { isTimezone, MAX_CANDLES, validateDataset } from '../data/validate';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CSV_TEMPLATE =
  'date,open,high,low,close,volume\r\n2024-01-02,100,105,99,103,1200\r\n2024-01-03,103,106,101,104,\r\n';
export type CsvField = 'date' | 'open' | 'high' | 'low' | 'close' | 'volume';
export type ColumnMapping = Record<CsvField, number>;
export type DateFormat =
  'iso-date' | 'day-first' | 'month-first' | 'iso-timestamp';
export type NumberFormat = 'dot' | 'comma';
export interface ParsedCsv {
  headers: string[];
  rows: { record: number; values: string[] }[];
}
export interface ImportOptions {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  timezone: string;
  adjustment: 'raw' | 'adjusted' | 'unknown';
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  trailingIncomplete?: boolean;
}
export class CsvImportError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'CsvImportError';
  }
}
export function parseCsv(text: string, delimiter = ','): ParsedCsv {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES)
    throw new CsvImportError([
      'File exceeds the 10 MiB limit. Split the history into smaller files.',
    ]);
  if (!text.trim())
    throw new CsvImportError([
      'The CSV file is empty. Include a header and daily OHLC rows.',
    ]);
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    header: false,
    dynamicTyping: false,
    delimiter,
    skipEmptyLines: false,
    preview: MAX_CANDLES + 2,
  });
  if (parsed.errors.length)
    throw new CsvImportError(
      parsed.errors
        .slice(0, 20)
        .map((error) => `CSV record ${(error.row ?? 0) + 1}: ${error.message}`),
    );
  if (parsed.meta.truncated)
    throw new CsvImportError([
      `CSV exceeds the ${MAX_CANDLES.toLocaleString('en-US')} row limit. Split the file.`,
    ]);
  const headers = parsed.data[0]?.map((header) => header.trim()) ?? [];
  if (
    headers.length < 5 ||
    headers.length > 100 ||
    headers.some((header) => !header || header.length > 100) ||
    new Set(headers.map((header) => header.toLowerCase())).size !==
      headers.length
  )
    throw new CsvImportError([
      'Headers must be unique, non-empty names (5–100 columns). Check the delimiter and include date/open/high/low/close.',
    ]);
  const rows = parsed.data
    .slice(1)
    .map((values, index) => ({ record: index + 2, values }))
    .filter((row) => row.values.some((value) => value.trim() !== ''));
  if (!rows.length)
    throw new CsvImportError(['No data rows were found below the header.']);
  if (rows.length > MAX_CANDLES)
    throw new CsvImportError([
      `CSV exceeds the ${MAX_CANDLES.toLocaleString('en-US')} candle limit.`,
    ]);
  const malformed = rows.filter((row) => row.values.length !== headers.length);
  if (malformed.length)
    throw new CsvImportError(
      malformed
        .slice(0, 20)
        .map(
          (row) =>
            `CSV record ${row.record}: expected ${headers.length} columns, received ${row.values.length}. Quote decimal commas or check the delimiter.`,
        ),
    );
  return { headers, rows };
}
export function suggestMapping(headers: string[]): ColumnMapping {
  const find = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header.toLowerCase()));
  return {
    date: find('date', 'time', 'timestamp'),
    open: find('open'),
    high: find('high'),
    low: find('low'),
    close: find('close'),
    volume: find('volume'),
  };
}
function parseDate(
  value: string,
  format: DateFormat,
  timezone: string,
): TradingDate {
  let date = value.trim();
  if (format === 'day-first' || format === 'month-first') {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
    if (!match)
      throw new Error(
        `Date must match ${format === 'day-first' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'} exactly.`,
      );
    date = `${match[3]}-${format === 'day-first' ? match[2] : match[1]}-${format === 'day-first' ? match[1] : match[2]}`;
  } else if (format === 'iso-timestamp') {
    if (!isTimezone(timezone))
      throw new Error('Supply an exchange timezone to interpret timestamps.');
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        date,
      ) ||
      !isTradingDate(date.slice(0, 10)) ||
      !Number.isFinite(Date.parse(date)) ||
      Number(date.slice(11, 13)) > 23 ||
      Number(date.slice(14, 16)) > 59 ||
      Number(date.slice(17, 19)) > 59
    )
      throw new Error(
        'Timestamp must be a real ISO datetime with Z or ±HH:mm. Offset-free local times are ambiguous; supply an explicit offset.',
      );
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(date));
    const part = (name: string) =>
      parts.find((item) => item.type === name)?.value;
    date = `${part('year')}-${part('month')}-${part('day')}`;
  }
  if (!isTradingDate(date))
    throw new Error(
      'Expected a real YYYY-MM-DD trading date. Choose an explicit slash-date format if needed.',
    );
  return date;
}
function parseNumber(
  value: string,
  format: NumberFormat,
  field: string,
): number {
  const raw = value.trim();
  const pattern =
    format === 'dot'
      ? /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
      : /^[+-]?(?:\d+(?:,\d+)?|,\d+)$/;
  if (!pattern.test(raw))
    throw new Error(
      `${field} must use the selected ${format === 'dot' ? 'dot' : 'comma'} decimal format, without thousands separators, blanks or scientific notation.`,
    );
  const number = Number(format === 'comma' ? raw.replace(',', '.') : raw);
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER)
    throw new Error(`${field} is outside the supported finite numeric range.`);
  return number;
}
export function importCsv(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  options: ImportOptions,
  filename: string,
  identity: string,
  retrievedAt: string,
): { dataset: Dataset; warnings: string[] } {
  const issues: string[] = [];
  if (!options.symbol.trim())
    issues.push('Provide a listing symbol (a user-defined label is allowed).');
  if (!/^[A-Z]{3}$/.test(options.currency))
    issues.push(
      'Provide a three-letter uppercase currency code, such as USD or INR.',
    );
  if (!options.timezone || !isTimezone(options.timezone))
    issues.push(
      'Provide a valid exchange timezone, such as America/New_York, Asia/Kolkata or UTC.',
    );
  if (!['raw', 'adjusted', 'unknown'].includes(options.adjustment))
    issues.push(
      'Choose raw, consistently adjusted, or unknown prices. Never substitute adjusted close alone into raw OHLC.',
    );
  if (
    !['iso-date', 'day-first', 'month-first', 'iso-timestamp'].includes(
      options.dateFormat,
    ) ||
    !['dot', 'comma'].includes(options.numberFormat)
  )
    issues.push('Choose a supported explicit date and number format.');
  const required: CsvField[] = ['date', 'open', 'high', 'low', 'close'];
  const selected = [
    ...required,
    ...(mapping.volume >= 0 ? (['volume'] as CsvField[]) : []),
  ];
  for (const field of selected)
    if (
      !Number.isInteger(mapping[field]) ||
      mapping[field] < 0 ||
      mapping[field] >= parsed.headers.length
    )
      issues.push(`Map the ${field} column.`);
  if (new Set(selected.map((field) => mapping[field])).size !== selected.length)
    issues.push('Each OHLCV field must use a different column.');
  if (issues.length) throw new CsvImportError(issues);
  const rows: Candle[] = [];
  for (const row of parsed.rows) {
    try {
      const cell = (field: CsvField) => row.values[mapping[field]] ?? '';
      const candle: Candle = {
        time: parseDate(cell('date'), options.dateFormat, options.timezone),
        open: parseNumber(cell('open'), options.numberFormat, 'open'),
        high: parseNumber(cell('high'), options.numberFormat, 'high'),
        low: parseNumber(cell('low'), options.numberFormat, 'low'),
        close: parseNumber(cell('close'), options.numberFormat, 'close'),
        volume:
          mapping.volume < 0 || !cell('volume').trim()
            ? null
            : parseNumber(cell('volume'), options.numberFormat, 'volume'),
        incomplete: false,
      };
      normalizeCandles([candle]);
      rows.push(candle);
    } catch (error) {
      issues.push(
        `CSV record ${row.record}: ${error instanceof Error ? error.message.replace(/^Row 1: /, '') : 'Invalid data.'}`,
      );
    }
    if (issues.length >= 20) break;
  }
  if (issues.length) throw new CsvImportError(issues);
  let candles: Candle[];
  try {
    candles = normalizeCandles(rows);
  } catch (error) {
    if (error instanceof DataValidationError)
      throw new CsvImportError([
        `CSV record ${parsed.rows[error.row - 1]?.record}: ${error.message.replace(/^Row \d+: /, '')}`,
      ]);
    throw error;
  }
  const dataset = validateDataset({
    candles: options.trailingIncomplete
      ? candles.map((candle, index) =>
          index === candles.length - 1
            ? { ...candle, incomplete: true }
            : candle,
        )
      : candles,
    metadata: {
      id: `import:${identity}:daily`,
      revision: `import:${identity}:v1`,
      mode: 'import',
      source: `User CSV · ${filename}`,
      provider: null,
      listing: {
        id: `import:${identity}`,
        symbol: options.symbol.trim(),
        name: options.name.trim() || null,
        exchange: options.exchange.trim() || null,
        mic: null,
        currency: options.currency,
        timezone: options.timezone,
      },
      interval: 'daily',
      adjustment: options.adjustment,
      requestedRange: null,
      coverage: { from: candles[0]!.time, to: candles.at(-1)!.time },
      retrievedAt,
      latestCandleTime: candles.at(-1)!.time,
      freshness: 'historical-import',
      delay: 'unknown',
      aggregation: null,
      importConventions: {
        filename,
        dateFormat: options.dateFormat,
        numberFormat: options.numberFormat,
        timezoneInterpretation:
          options.dateFormat === 'iso-timestamp'
            ? 'Explicit-offset timestamps converted to user-specified exchange date; daily bars only.'
            : 'Source date preserved without timezone conversion.',
      },
    },
  });
  const warnings: string[] = [];
  if (options.trailingIncomplete)
    warnings.push(
      `Last daily candle (${candles.at(-1)!.time}) is marked incomplete; its values are provisional.`,
    );
  const unknown = candles.filter((candle) => candle.volume === null).length;
  if (unknown)
    warnings.push(
      `${unknown.toLocaleString('en-US')} ${unknown === 1 ? 'bar has' : 'bars have'} unknown volume. They are not plotted as zero; volume-dependent calculations are unavailable for those inputs.`,
    );
  if (candles.length < rows.length)
    warnings.push(
      `${rows.length - candles.length} exact duplicate rows coalesced. Conflicting duplicates are rejected.`,
    );
  if (!options.exchange.trim())
    warnings.push('Exchange is unavailable; no exchange calendar is assumed.');
  if (options.adjustment === 'unknown')
    warnings.push('Adjustment convention is unknown, as declared.');
  return { dataset, warnings };
}
