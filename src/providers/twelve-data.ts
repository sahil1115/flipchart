import { normalizeCandles, isTradingDate } from '../data/normalize';
import { object, validateDataset, validateListing } from '../data/validate';
import type { Candle, Dataset, Listing, TradingDate } from '../data/types';
import { ProviderError } from './types';
import type {
  HistoryRequest,
  MarketDataProvider,
  ProviderCapabilities,
} from './types';

export const TWELVE_DATA_BASE = 'https://api.twelvedata.com';
export const MAX_PROVIDER_BARS = 5000;
export interface ConnectionReport {
  checkedAt: string;
  usage: number | null;
  limit: number | null;
  plan: string | null;
}
export interface ConnectedProvider extends MarketDataProvider {
  testConnection(
    credential: string,
    signal: AbortSignal,
  ): Promise<ConnectionReport>;
}
const messages = {
  'missing-key': 'Enter your Twelve Data API key. Demo and CSV need no key.',
  'invalid-key':
    'Twelve Data rejected the key. Check it in your provider account.',
  'quota-exhausted':
    'Twelve Data quota is exhausted. Check your account limits; no automatic retry will run.',
  'unsupported-listing':
    'This listing is unavailable. Select a supported stock or ETF on the correct exchange.',
  'unsupported-interval':
    'This provider request interval is unavailable. Load daily history and use the labeled local weekly/monthly view.',
  'unsupported-endpoint':
    'Your account may not grant this endpoint, market or adjustment. Check provider access and add-ons.',
  'insufficient-history':
    'The provider cannot supply the requested history. Try a shorter history window; some indicators may remain unavailable.',
  'empty-response':
    'No data was returned for this selection and date range. Check the listing and coverage.',
  'network-cors':
    'Could not reach Twelve Data. Check internet access or browser CORS restrictions. No proxy or automatic retry is used.',
  'provider-outage':
    'Twelve Data is temporarily unavailable. The loaded chart is retained; refresh manually later.',
  'malformed-response':
    'Twelve Data returned invalid or inconsistent data. The response was not loaded.',
  cancelled: 'The obsolete request was cancelled.',
} as const;
function fail(
  category: keyof typeof messages,
  retryAt: string | null = null,
): never {
  throw new ProviderError(category, messages[category], retryAt);
}
export function validateCredential(value: string): string {
  const key = value.trim();
  if (!key) fail('missing-key');
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(key)) fail('invalid-key');
  return key;
}
export function exchangeDate(
  timezone: string | null,
  now: Date = new Date(),
): TradingDate {
  if (!timezone) return now.toISOString().slice(0, 10) as TradingDate;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}` as TradingDate;
}
function safeText(
  value: unknown,
  credential: string,
  required = false,
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) fail('malformed-response');
    return null;
  }
  if (
    typeof value !== 'string' ||
    value.length > 200 ||
    [...value].some((c) => c.charCodeAt(0) < 32) ||
    value.includes(credential)
  )
    fail('malformed-response');
  return value.trim();
}
function number(value: unknown, nullable = false): number | null {
  if (nullable && (value === undefined || value === null || value === ''))
    return null;
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
  )
    fail('malformed-response');
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail('malformed-response');
  return parsed;
}
function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) fail('cancelled');
}
function retryTime(value: string | null, now: Date): string | null {
  if (!value) return null;
  const stamp = /^\d+$/.test(value)
    ? now.getTime() + Number(value) * 1000
    : Date.parse(value);
  return Number.isFinite(stamp) &&
    stamp >= now.getTime() &&
    stamp <= now.getTime() + 7 * 86400000
    ? new Date(stamp).toISOString()
    : null;
}
function responseError(
  code: number,
  message: unknown,
  retryAt: string | null,
): never {
  const hint = typeof message === 'string' ? message.toLowerCase() : '';
  if (code === 401) fail('invalid-key');
  if (code === 429) fail('quota-exhausted', retryAt);
  if (code >= 500) fail('provider-outage');
  if (code === 403) fail('unsupported-endpoint');
  if (/insufficient|not enough|history limit/.test(hint))
    fail('insufficient-history');
  if (/no data|empty/.test(hint)) fail('empty-response');
  if (/interval/.test(hint)) fail('unsupported-interval');
  if (code === 404 || /symbol|listing|instrument/.test(hint))
    fail('unsupported-listing');
  fail('malformed-response');
}
export class TwelveDataProvider implements ConnectedProvider {
  readonly id = 'twelve-data';
  constructor(
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}
  private async request(
    endpoint: string,
    parameters: Record<string, string>,
    credential: string,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const key = validateCredential(credential);
    checkCancelled(signal);
    const url = new URL(endpoint, TWELVE_DATA_BASE);
    for (const [name, value] of Object.entries(parameters))
      url.searchParams.set(name, value);
    let response: Response;
    try {
      response = await this.fetcher(url.toString(), {
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        headers: { Authorization: `apikey ${key}` },
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
      });
    } catch {
      checkCancelled(signal);
      fail('network-cors');
    }
    checkCancelled(signal);
    const retryAt = retryTime(response.headers.get('Retry-After'), this.now());
    // Never retain authenticated envelopes or provider message/URL text.
    let payload: Record<string, unknown>;
    try {
      if (Number(response.headers.get('Content-Length')) > 5 * 1024 * 1024)
        fail('malformed-response');
      const text = await response.text();
      if (text.length > 5 * 1024 * 1024) fail('malformed-response');
      payload = object(JSON.parse(text), 'provider response');
    } catch {
      checkCancelled(signal);
      if (!response.ok) responseError(response.status, null, retryAt);
      fail('malformed-response');
    }
    checkCancelled(signal);
    if (
      !response.ok ||
      payload.status === 'error' ||
      (typeof payload.code === 'number' && payload.code >= 400)
    )
      responseError(
        typeof payload.code === 'number' && payload.code >= 400
          ? payload.code
          : response.status,
        payload.message,
        retryAt,
      );
    return payload;
  }
  async testConnection(
    credential: string,
    signal: AbortSignal,
  ): Promise<ConnectionReport> {
    const data = await this.request(
      '/api_usage',
      { format: 'JSON' },
      credential,
      signal,
    );
    if (
      !Number.isInteger(data.current_usage) ||
      !Number.isInteger(data.plan_limit) ||
      Number(data.current_usage) < 0 ||
      Number(data.plan_limit) < 0
    )
      fail('malformed-response');
    return {
      checkedAt: this.now().toISOString(),
      usage: Number(data.current_usage),
      limit: Number(data.plan_limit),
      plan: safeText(data.plan_category, credential),
    };
  }
  getCapabilities(): ProviderCapabilities {
    return {
      intervals: ['daily'],
      adjustmentModes: ['raw', 'adjusted'],
      historyLimit: { maxBars: MAX_PROVIDER_BARS, earliestDate: null },
      access: 'unknown',
      unavailableFeatures: [
        'Native adapter requests are daily-only; weekly/monthly views aggregate loaded daily history locally.',
        'Market, adjustment and historical coverage access depend on your subscription/add-ons; no entitlement is inferred.',
        'Provider data is session-only; persistent caching is disabled.',
      ],
    };
  }
  async searchSymbol(
    query: string,
    credential: string,
    signal: AbortSignal,
  ): Promise<Listing[]> {
    if (!query.trim() || query.length > 80) return [];
    const data = await this.request(
      '/symbol_search',
      { symbol: query.trim(), outputsize: '30' },
      credential,
      signal,
    );
    try {
      if (
        data.status !== 'ok' ||
        !Array.isArray(data.data) ||
        data.data.length > 120
      )
        fail('malformed-response');
      const listings: Listing[] = [];
      for (const value of data.data) {
        const row = object(value, 'search listing');
        if (
          ![
            'Common Stock',
            'ETF',
            'Preferred Stock',
            'Depositary Receipt',
            'REIT',
          ].includes(String(row.instrument_type))
        )
          continue;
        const symbol = safeText(row.symbol, credential, true)!,
          exchange = safeText(row.exchange, credential),
          mic = safeText(row.mic_code, credential);
        if (!exchange && !mic) continue;
        const listing = validateListing({
          id: `live:twelve-data:${encodeURIComponent(JSON.stringify([symbol, mic, exchange]))}`,
          symbol,
          exchange,
          mic,
          name: safeText(row.instrument_name, credential),
          currency: safeText(row.currency, credential),
          timezone: safeText(row.exchange_timezone, credential),
        });
        if (!listings.some((item) => item.id === listing.id))
          listings.push(listing);
      }
      return listings;
    } catch {
      fail('malformed-response');
    }
  }
  async getOHLCV(
    request: HistoryRequest,
    credential: string,
    signal: AbortSignal,
  ): Promise<Dataset> {
    if (request.interval !== 'daily') fail('unsupported-interval');
    if (!['raw', 'adjusted'].includes(request.adjustment))
      fail('unsupported-endpoint');
    if (
      !isTradingDate(request.from) ||
      !isTradingDate(request.to) ||
      request.from > request.to
    )
      fail('insufficient-history');
    const listing = validateListing(request.listing);
    if (
      !listing.id.startsWith('live:twelve-data:') ||
      (!listing.mic && !listing.exchange)
    )
      fail('unsupported-listing');
    const data = await this.request(
      '/time_series',
      {
        symbol: listing.symbol,
        interval: '1day',
        ...(listing.mic
          ? { mic_code: listing.mic }
          : { exchange: listing.exchange! }),
        start_date: request.from,
        end_date: request.to,
        outputsize: String(MAX_PROVIDER_BARS),
        order: 'ASC',
        format: 'JSON',
        adjust: request.adjustment === 'raw' ? 'none' : 'all',
      },
      credential,
      signal,
    );
    try {
      if (
        data.status !== 'ok' ||
        !Array.isArray(data.values) ||
        data.values.length > MAX_PROVIDER_BARS
      )
        fail('malformed-response');
      if (data.values.length === 0) fail('empty-response');
      const meta = object(data.meta, 'history metadata');
      const symbol = safeText(meta.symbol, credential, true)!,
        exchange = safeText(meta.exchange, credential),
        mic = safeText(meta.mic_code, credential);
      if (
        meta.interval !== '1day' ||
        symbol.toUpperCase() !== listing.symbol.toUpperCase() ||
        (listing.mic
          ? mic !== listing.mic
          : exchange?.toUpperCase() !== listing.exchange?.toUpperCase())
      )
        fail('malformed-response');
      const actualListing = validateListing({
        ...listing,
        currency: safeText(meta.currency, credential, true),
        timezone: safeText(meta.exchange_timezone, credential, true),
        exchange,
        mic,
      });
      const now = this.now(),
        today = exchangeDate(actualListing.timezone, now);
      const candles = normalizeCandles(
        data.values.map((value) => {
          const row = object(value, 'provider candle');
          if (
            !isTradingDate(row.datetime) ||
            row.datetime < request.from ||
            row.datetime > request.to
          )
            fail('malformed-response');
          return {
            time: row.datetime,
            open: number(row.open)!,
            high: number(row.high)!,
            low: number(row.low)!,
            close: number(row.close)!,
            volume: number(row.volume, true),
            ...(row.datetime >= today ? { incomplete: true } : {}),
          } satisfies Candle;
        }),
      );
      const latest = candles.at(-1)!.time;
      return validateDataset({
        candles,
        metadata: {
          id: `live:twelve-data:${encodeURIComponent(JSON.stringify([listing.id, request.from, request.to, request.adjustment]))}`,
          revision: crypto.randomUUID(),
          mode: 'live',
          provider: this.id,
          source: 'Data provided by Twelve Data',
          listing: actualListing,
          interval: 'daily',
          adjustment: request.adjustment,
          requestedRange: { from: request.from, to: request.to },
          coverage: { from: candles[0]!.time, to: latest },
          retrievedAt: now.toISOString(),
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
