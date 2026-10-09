import { normalizeCandles, isTradingDate } from '../data/normalize';
import { object, validateDataset, validateListing } from '../data/validate';
import type { Candle, Dataset, Listing } from '../data/types';
import { ProviderError } from './types';
import type {
  HistoryRequest,
  ProviderCapabilities,
  ProviderErrorCategory,
} from './types';
import type { ConnectedProvider, ConnectionReport } from './twelve-data';
import { exchangeDate } from './twelve-data';

function fail(category: ProviderErrorCategory): never {
  const messages: Partial<Record<ProviderErrorCategory, string>> = {
    'invalid-key':
      'Alpha Vantage rejected the key. Check your provider account.',
    'missing-key': 'Enter your Alpha Vantage API key.',
    'quota-exhausted':
      'Alpha Vantage quota is exhausted. Check your account; no automatic retry will run.',
    'unsupported-endpoint':
      'This endpoint or full daily history needs different account access. Adjusted-close feeds are not supported as adjusted OHLC.',
    'unsupported-listing':
      'Select an Alpha Vantage search result; identifiers are provider-specific.',
    'unsupported-interval':
      'Only native daily, weekly and monthly OHLCV are supported.',
    'network-cors':
      'Could not reach Alpha Vantage. Check internet access or browser CORS restrictions.',
    'empty-response': 'No bars were returned in the requested range.',
    'insufficient-history':
      'The requested history boundaries are invalid or unavailable.',
    'provider-outage':
      'Alpha Vantage is temporarily unavailable. Refresh manually later.',
    cancelled: 'The obsolete provider request was cancelled.',
  };
  throw new ProviderError(
    category,
    messages[category] ??
      'Alpha Vantage returned invalid or inconsistent data. The response was not loaded.',
  );
}
function text(value: unknown, key: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200 ||
    value.includes(key) ||
    [...value].some((c) => c.charCodeAt(0) < 32)
  )
    fail('malformed-response');
  return value.trim();
}
function numeric(value: unknown, nullable = false): number | null {
  if (nullable && (value == null || value === '')) return null;
  if (
    typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
    !Number.isFinite(Number(value))
  )
    fail('malformed-response');
  return Number(value);
}
export class AlphaVantageProvider implements ConnectedProvider {
  readonly id = 'alpha-vantage';
  constructor(
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async request(
    parameters: Record<string, string>,
    key: string,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!key.trim()) fail('missing-key');
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(key)) fail('invalid-key');
    if (signal.aborted) fail('cancelled');
    const url = new URL('https://www.alphavantage.co/query');
    Object.entries({ ...parameters, apikey: key, datatype: 'json' }).forEach(
      ([name, value]) => url.searchParams.set(name, value),
    );
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      });
    } catch {
      if (signal.aborted) fail('cancelled');
      fail('network-cors');
    }
    if (signal.aborted) fail('cancelled');
    if (response.status === 401) fail('invalid-key');
    if (response.status === 429) fail('quota-exhausted');
    if (response.status === 403) fail('unsupported-endpoint');
    if (response.status >= 500) fail('provider-outage');
    let data: Record<string, unknown>;
    try {
      if (Number(response.headers.get('Content-Length')) > 5 * 1024 * 1024)
        fail('malformed-response');
      const body = await response.text();
      if (body.length > 5 * 1024 * 1024 || !response.ok)
        fail('malformed-response');
      data = object(JSON.parse(body), 'provider response');
    } catch {
      if (signal.aborted) fail('cancelled');
      fail('malformed-response');
    }
    if (signal.aborted) fail('cancelled');
    const hint = [data['Error Message'], data.Information, data.Note]
      .filter((v) => typeof v === 'string')
      .join(' ')
      .toLowerCase();
    if (hint) {
      if (/invalid.*(api.?key)|api.?key.*invalid/.test(hint))
        fail('invalid-key');
      if (
        /rate limit|frequency|requests per|calls? per|call volume|quota/.test(
          hint,
        )
      )
        fail('quota-exhausted');
      if (/premium|subscription|outputsize/.test(hint))
        fail('unsupported-endpoint');
      if (data['Error Message']) fail('unsupported-listing');
      fail('unsupported-endpoint');
    }
    return data;
  }
  getCapabilities(): ProviderCapabilities {
    return {
      intervals: ['daily', 'weekly', 'monthly'],
      adjustmentModes: ['raw'],
      historyLimit: { maxBars: null, earliestDate: null },
      access: 'unknown',
      unavailableFeatures: [
        'Daily compact returns at most 100 bars; full daily history requires premium access.',
        'Native weekly/monthly raw OHLCV preserve the provider’s last-trading-day labels. Account access remains unverified.',
        'Adjusted-close endpoints are excluded; exchange/MIC and search timezone are unavailable. Region is not an exchange.',
        'No persistent provider cache or automatic fallback to another provider.',
      ],
    };
  }
  async searchSymbol(
    query: string,
    key: string,
    signal: AbortSignal,
  ): Promise<Listing[]> {
    if (!query.trim() || query.length > 80) return [];
    const data = await this.request(
      { function: 'SYMBOL_SEARCH', keywords: query.trim() },
      key,
      signal,
    );
    try {
      if (!Array.isArray(data.bestMatches) || data.bestMatches.length > 120)
        fail('malformed-response');
      const listings: Listing[] = [];
      for (const value of data.bestMatches) {
        const row = object(value, 'search result');
        if (!['Equity', 'ETF'].includes(String(row['3. type']))) continue;
        const symbol = text(row['1. symbol'], key),
          region = text(row['4. region'], key),
          currency = text(row['8. currency'], key);
        const listing = validateListing({
          id: `live:alpha-vantage:${encodeURIComponent(JSON.stringify([symbol, region, currency]))}`,
          symbol,
          region,
          currency,
          name: text(row['2. name'], key),
          exchange: null,
          mic: null,
          timezone: null,
        });
        if (!listings.some((item) => item.id === listing.id))
          listings.push(listing);
      }
      return listings;
    } catch {
      fail('malformed-response');
    }
  }
  async testConnection(
    key: string,
    signal: AbortSignal,
  ): Promise<ConnectionReport> {
    await this.searchSymbol('IBM', key, signal);
    return {
      checkedAt: this.now().toISOString(),
      usage: null,
      limit: null,
      plan: null,
    };
  }
  async getOHLCV(
    request: HistoryRequest,
    key: string,
    signal: AbortSignal,
  ): Promise<Dataset> {
    if (!['daily', 'weekly', 'monthly'].includes(request.interval))
      fail('unsupported-interval');
    if (request.adjustment !== 'raw') fail('unsupported-endpoint');
    if (
      !isTradingDate(request.from) ||
      !isTradingDate(request.to) ||
      request.from > request.to
    )
      fail('insufficient-history');
    const listing = validateListing(request.listing);
    if (!listing.id.startsWith('live:alpha-vantage:') || !listing.currency)
      fail('unsupported-listing');
    const data = await this.request(
      {
        function: `TIME_SERIES_${request.interval.toUpperCase()}`,
        symbol: listing.symbol,
        ...(request.interval === 'daily'
          ? { outputsize: request.historySize ?? 'compact' }
          : {}),
      },
      key,
      signal,
    );
    try {
      const meta = object(data['Meta Data'], 'history metadata');
      if (text(meta['2. Symbol'], key) !== listing.symbol)
        fail('malformed-response');
      const actual = validateListing({
        ...listing,
        timezone: text(
          meta[request.interval === 'daily' ? '5. Time Zone' : '4. Time Zone'],
          key,
        ),
      });
      const series = object(
        data[
          request.interval === 'daily'
            ? 'Time Series (Daily)'
            : request.interval === 'weekly'
              ? 'Weekly Time Series'
              : 'Monthly Time Series'
        ],
        'history',
      );
      if (Object.keys(series).length > 10000) fail('malformed-response');
      const today = exchangeDate(actual.timezone, this.now());
      const samePeriod = (date: string) => {
        if (request.interval === 'daily') return date >= today;
        if (request.interval === 'monthly')
          return date.slice(0, 7) === today.slice(0, 7);
        const monday = (value: string) => {
          const d = new Date(`${value}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
          return d.toISOString().slice(0, 10);
        };
        return monday(date) === monday(today);
      };
      const all = Object.entries(series).map(([time, value]) => {
        if (!isTradingDate(time)) fail('malformed-response');
        const row = object(value, 'candle');
        return {
          time,
          open: numeric(row['1. open'])!,
          high: numeric(row['2. high'])!,
          low: numeric(row['3. low'])!,
          close: numeric(row['4. close'])!,
          volume: numeric(row['5. volume'], true),
          ...(samePeriod(time) ? { incomplete: true } : {}),
        } satisfies Candle;
      });
      const candles = normalizeCandles(all).filter(
        (bar) => bar.time >= request.from && bar.time <= request.to,
      );
      if (!candles.length) fail('empty-response');
      const latest = candles.at(-1)!.time;
      return validateDataset({
        candles,
        metadata: {
          id: `live:alpha-vantage:${encodeURIComponent(JSON.stringify([listing.id, request.interval, request.from, request.to, request.historySize ?? 'compact']))}`,
          revision: crypto.randomUUID(),
          mode: 'live',
          provider: this.id,
          source: 'Data provided by Alpha Vantage',
          listing: actual,
          interval: request.interval,
          adjustment: 'raw',
          requestedRange: { from: request.from, to: request.to },
          coverage: { from: candles[0]!.time, to: latest },
          retrievedAt: this.now().toISOString(),
          latestCandleTime: latest,
          freshness: 'unknown',
          delay: 'unknown',
          aggregation: null,
        },
      });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      fail('malformed-response');
    }
  }
}
