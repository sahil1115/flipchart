import { isTradingDate, normalizeCandles } from './normalize';
import type { Candle, Dataset, Listing, TradingDate } from './types';

export const MAX_CANDLES = 50_000;
export class DatasetValidationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'DatasetValidationError';
  }
}
export function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new DatasetValidationError(`${field} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 300 ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new DatasetValidationError(
      `${field} must be non-empty text (at most 300 characters).`,
    );
  return value.trim();
}
function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new DatasetValidationError(`${field} has an unsupported value.`);
  return value as T;
}
export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
function coverage(
  value: unknown,
  field: string,
): { from: TradingDate; to: TradingDate } | null {
  if (value === null) return null;
  const range = object(value, field);
  if (
    !isTradingDate(range.from) ||
    !isTradingDate(range.to) ||
    range.from > range.to
  )
    throw new DatasetValidationError(
      `${field} requires ordered YYYY-MM-DD dates.`,
    );
  return { from: range.from, to: range.to };
}
export function validateListing(input: unknown): Listing {
  const raw = object(input, 'listing');
  const currency = text(raw.currency, 'currency', true);
  const timezone = text(raw.timezone, 'timezone', true);
  if (currency !== null && !/^[A-Z]{3}$/.test(currency))
    throw new DatasetValidationError(
      'Currency must be a three-letter uppercase code or explicitly unavailable.',
    );
  if (timezone !== null && !isTimezone(timezone))
    throw new DatasetValidationError(
      'Timezone must be a valid IANA timezone or explicitly unavailable.',
    );
  return {
    id: text(raw.id, 'listing.id')!,
    ...(raw.region === undefined
      ? {}
      : { region: text(raw.region, 'region', true) }),
    symbol: text(raw.symbol, 'symbol')!,
    name: text(raw.name, 'name', true),
    exchange: text(raw.exchange, 'exchange', true),
    mic: text(raw.mic, 'MIC', true),
    currency,
    timezone,
  };
}

/** Validate unknown data and project only documented non-secret fields. */
export function validateDataset(input: unknown): Dataset {
  const raw = object(input, 'dataset');
  if (!Array.isArray(raw.candles) || raw.candles.length > MAX_CANDLES)
    throw new DatasetValidationError(
      `Dataset candles must be an array of at most ${MAX_CANDLES.toLocaleString('en-US')} bars.`,
    );
  const candles = normalizeCandles(
    raw.candles.map((value, i) => {
      const row = object(value, `Row ${i + 1}`);
      return {
        time: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        ...(row.incomplete === undefined ? {} : { incomplete: row.incomplete }),
      } as Candle;
    }),
  );
  const m = object(raw.metadata, 'metadata');
  const mode = choice(m.mode, ['demo', 'import', 'live'], 'mode');
  const provider = text(m.provider, 'provider', true);
  const id = text(m.id, 'dataset ID')!;
  const listing = validateListing(m.listing);
  if (!id.startsWith(`${mode}:`) || !listing.id.startsWith(`${mode}:`))
    throw new DatasetValidationError(
      'Dataset/listing identities must be namespaced by their source mode.',
    );
  if ((mode === 'live') !== (provider !== null))
    throw new DatasetValidationError(
      'Live datasets require a provider; demo/import datasets must not claim a provider.',
    );
  const adjustment = choice(
    m.adjustment,
    ['synthetic', 'raw', 'adjusted', 'unknown'],
    'adjustment',
  );
  const freshness = choice(
    m.freshness,
    ['historical-demo', 'historical-import', 'fresh', 'stale', 'unknown'],
    'freshness',
  );
  const delay = choice(
    m.delay,
    ['synthetic', 'end-of-day', 'delayed', 'unknown'],
    'delay',
  );
  if (
    (mode === 'demo') !== (adjustment === 'synthetic') ||
    (mode !== 'demo' &&
      (delay === 'synthetic' || freshness === 'historical-demo')) ||
    (mode !== 'import' && freshness === 'historical-import')
  )
    throw new DatasetValidationError(
      'Source mode and synthetic/import metadata cannot be confused.',
    );
  if (
    typeof m.retrievedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      m.retrievedAt,
    ) ||
    !Number.isFinite(Date.parse(m.retrievedAt)) ||
    !isTradingDate(m.retrievedAt.slice(0, 10)) ||
    Number(m.retrievedAt.slice(11, 13)) > 23 ||
    Number(m.retrievedAt.slice(14, 16)) > 59 ||
    Number(m.retrievedAt.slice(17, 19)) > 59
  )
    throw new DatasetValidationError(
      'Retrieval time must be an ISO timestamp with an explicit offset.',
    );
  const actual = coverage(m.coverage, 'coverage');
  const first = candles[0]?.time ?? null;
  const latest = candles.at(-1)?.time ?? null;
  if (
    latest !== m.latestCandleTime ||
    (first === null
      ? actual !== null
      : actual?.from !== first || actual?.to !== latest)
  )
    throw new DatasetValidationError(
      'Coverage and latest candle time must match the normalized history.',
    );
  const metadata: Dataset['metadata'] = {
    id,
    revision: text(m.revision, 'revision')!,
    mode,
    provider,
    listing,
    source: text(m.source, 'source')!,
    interval: choice(m.interval, ['daily', 'weekly', 'monthly'], 'interval'),
    adjustment,
    requestedRange: coverage(m.requestedRange, 'requested range'),
    coverage: actual,
    retrievedAt: m.retrievedAt,
    latestCandleTime: latest,
    freshness,
    delay,
    aggregation: text(m.aggregation, 'aggregation', true),
  };
  if (m.importConventions !== undefined) {
    if (mode !== 'import')
      throw new DatasetValidationError(
        'Import conventions belong only to imported data.',
      );
    const info = object(m.importConventions, 'import conventions');
    metadata.importConventions = {
      filename: text(info.filename, 'filename')!,
      dateFormat: choice(
        info.dateFormat,
        ['iso-date', 'day-first', 'month-first', 'iso-timestamp'],
        'date format',
      ),
      numberFormat: choice(
        info.numberFormat,
        ['dot', 'comma'],
        'number format',
      ),
      timezoneInterpretation: text(
        info.timezoneInterpretation,
        'timezone interpretation',
      )!,
    };
  }
  if (m.aggregationDetails !== undefined) {
    const info = object(m.aggregationDetails, 'aggregation details');
    if (
      info.sourceInterval !== 'daily' ||
      info.calendar !== 'UTC weekdays; exchange holidays unverified' ||
      !Array.isArray(info.groups) ||
      info.groups.length !== candles.length ||
      metadata.interval === 'daily' ||
      metadata.aggregation === null
    )
      throw new DatasetValidationError('Aggregation provenance is invalid.');
    metadata.aggregationDetails = {
      sourceInterval: 'daily',
      sourceCoverage: coverage(info.sourceCoverage, 'source coverage'),
      calendar: 'UTC weekdays; exchange holidays unverified',
      groups: info.groups.map((value, index) => {
        const group = object(value, 'aggregation group');
        if (
          !isTradingDate(group.time) ||
          group.time !== candles[index]?.time ||
          !isTradingDate(group.from) ||
          !isTradingDate(group.to) ||
          group.from > group.to ||
          typeof group.count !== 'number' ||
          !Number.isInteger(group.count) ||
          group.count <= 0 ||
          typeof group.partial !== 'boolean'
        )
          throw new DatasetValidationError(
            'Aggregation group coverage is invalid.',
          );
        return {
          time: group.time,
          from: group.from,
          to: group.to,
          count: group.count,
          partial: group.partial,
        };
      }),
    };
  }
  return { candles, metadata };
}
