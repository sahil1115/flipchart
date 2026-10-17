import { isTradingDate, normalizeCandles } from '../data/normalize';
import { object, validateDataset, validateListing } from '../data/validate';
import type { Candle, Dataset, Listing } from '../data/types';
import type {
  HistoryRequest,
  ProviderCapabilities,
  SearchOptions,
} from './types';
import { ProviderError } from './types';
import { exchangeDate } from './twelve-data';
import type { ConnectedProvider, ConnectionReport } from './twelve-data';

export type YahooMarket = 'india' | 'us';
interface MarketConfig {
  currency: string;
  timezone: string;
  /** Yahoo `exchange` codes accepted for this market. */
  exchanges: Record<string, { exchange: string; mic: string | null }>;
}
export const yahooMarkets: Record<YahooMarket, MarketConfig> = {
  india: {
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    exchanges: {
      NSI: { exchange: 'NSE', mic: 'XNSE' },
      NSE: { exchange: 'NSE', mic: 'XNSE' },
    },
  },
  us: {
    currency: 'USD',
    timezone: 'America/New_York',
    exchanges: {
      NMS: { exchange: 'NASDAQ', mic: 'XNAS' },
      NGM: { exchange: 'NASDAQ', mic: 'XNAS' },
      NCM: { exchange: 'NASDAQ', mic: 'XNAS' },
      NYQ: { exchange: 'NYSE', mic: 'XNYS' },
      ASE: { exchange: 'NYSE American', mic: 'XASE' },
      PCX: { exchange: 'NYSE Arca', mic: 'ARCX' },
      BTS: { exchange: 'Cboe BZX', mic: 'BATS' },
    },
  },
};
const usTicker = /^[A-Z][A-Z0-9-]{0,9}$/;
export const yahooMarketOf = (symbol: string): YahooMarket =>
  symbol.endsWith('.NS') ? 'india' : 'us';

/** A listing built from a typed symbol; Yahoo confirms it when history loads. */
export function yahooListing(query: string, market: YahooMarket): Listing {
  const config = yahooMarkets[market];
  const text = query.trim().toUpperCase();
  const symbol =
    market === 'india'
      ? `${text.replace(/\.NS$/, '')}.NS`
      : text.replace(/\./g, '-');
  if (
    market === 'india'
      ? !/^[A-Z0-9][A-Z0-9&_-]{0,39}\.NS$/.test(symbol)
      : !usTicker.test(symbol)
  )
    throw new ProviderError(
      'unsupported-listing',
      market === 'india'
        ? 'Enter an NSE trading symbol, such as RELIANCE.NS, TCS.NS, or M&M.NS.'
        : 'Enter a US ticker, such as AAPL, MSFT, or BRK-B.',
    );
  return {
    id: `live:yahoo-finance:${symbol}`,
    symbol,
    name: null,
    exchange: market === 'india' ? 'NSE' : 'US',
    mic: market === 'india' ? 'XNSE' : null,
    currency: config.currency,
    timezone: config.timezone,
  };
}
export const yahooNseListing = (query: string) => yahooListing(query, 'india');

/** Stocks and ETFs on the chosen market from Yahoo's search payload. */
function searchListings(payload: unknown, market: YahooMarket): Listing[] {
  const config = yahooMarkets[market];
  const quotes = object(payload, 'Yahoo search').quotes;
  if (!Array.isArray(quotes)) throw new Error('Invalid search');
  const listings: Listing[] = [];
  for (const item of quotes) {
    if (typeof item !== 'object' || item === null) continue;
    const quote = item as Record<string, unknown>;
    const place =
      typeof quote.exchange === 'string' &&
      Object.hasOwn(config.exchanges, quote.exchange)
        ? config.exchanges[quote.exchange]
        : undefined;
    if (
      !place ||
      typeof quote.symbol !== 'string' ||
      !['EQUITY', 'ETF'].includes(String(quote.quoteType)) ||
      (market === 'india'
        ? !quote.symbol.endsWith('.NS')
        : !usTicker.test(quote.symbol))
    )
      continue;
    const name = [quote.longname, quote.shortname].find(
      (value): value is string => typeof value === 'string' && value !== '',
    );
    try {
      const listing = {
        ...yahooListing(quote.symbol, market),
        name: name?.slice(0, 120) ?? null,
        exchange: place.exchange,
        mic: place.mic,
      };
      if (!listings.some((existing) => existing.id === listing.id))
        listings.push(listing);
    } catch {
      // Skip symbols the app cannot represent.
    }
  }
  return listings.slice(0, 10);
}

export class YahooFinanceProvider implements ConnectedProvider {
  readonly id = 'yahoo-finance';
  readonly requiresCredential = false;
  constructor(
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(input, init),
    private readonly now = () => new Date(),
    private readonly base = import.meta.env.BASE_URL,
  ) {}
  async searchSymbol(
    query: string,
    _credential: string,
    signal: AbortSignal,
    options: SearchOptions = {},
  ): Promise<Listing[]> {
    const cancelled = () =>
      new ProviderError('cancelled', 'The request was cancelled.');
    if (signal.aborted) throw cancelled();
    const market: YahooMarket = options.market === 'us' ? 'us' : 'india';
    const text = query.trim();
    let typed: Listing | null = null;
    try {
      typed = yahooListing(text, market);
    } catch {
      // Not a symbol; a name search can still match.
    }
    // A typed symbol stays usable when search is unavailable.
    const fallback = (error: ProviderError) => {
      if (typed) return [typed];
      throw error;
    };
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.base}api/yahoo/search?${new URLSearchParams({ q: text })}`,
        { signal, cache: 'no-store', credentials: 'omit' },
      );
    } catch {
      if (signal.aborted) throw cancelled();
      return fallback(
        new ProviderError(
          'network-cors',
          'Could not reach the local Yahoo relay. Run npm run dev or npm run preview and check your connection.',
        ),
      );
    }
    if (signal.aborted) throw cancelled();
    let payload: unknown;
    try {
      if (!response.ok) throw new Error('Search unavailable');
      payload = await response.json();
    } catch {
      if (signal.aborted) throw cancelled();
      return fallback(
        new ProviderError(
          response.status === 429 ? 'quota-exhausted' : 'unsupported-endpoint',
          response.status === 429
            ? 'Yahoo or the local relay is limiting requests. Try again manually later.'
            : 'Yahoo search is unavailable. Enter the exact ticker, or import a CSV instead.',
        ),
      );
    }
    if (signal.aborted) throw cancelled();
    let matches: Listing[];
    try {
      matches = searchListings(payload, market);
    } catch {
      return fallback(
        new ProviderError(
          'malformed-response',
          'Yahoo search returned data the app could not validate.',
        ),
      );
    }
    return matches.length || !typed ? matches : [typed];
  }
  getCapabilities(): ProviderCapabilities {
    return {
      intervals: ['daily'],
      adjustmentModes: ['unknown'],
      historyLimit: { maxBars: 5000, earliestDate: null },
      access: 'unknown',
      unavailableFeatures: [
        'Daily history only; availability is verified when you load.',
        'Yahoo OHLC is used as supplied. Corporate-action adjustment is unverified; adjusted close is not mixed with OHLC.',
        'Unofficial personal-use connection; access and accuracy are not guaranteed.',
        'Provider data is session-only. Nothing fetches automatically on reload.',
      ],
    };
  }
  async testConnection(): Promise<ConnectionReport> {
    return {
      checkedAt: this.now().toISOString(),
      usage: null,
      limit: null,
      plan: null,
    };
  }
  async getOHLCV(
    request: HistoryRequest,
    _credential: string,
    signal: AbortSignal,
  ): Promise<Dataset> {
    if (signal.aborted)
      throw new ProviderError('cancelled', 'The request was cancelled.');
    if (request.interval !== 'daily')
      throw new ProviderError(
        'unsupported-interval',
        'Load daily Yahoo history; weekly and monthly views are aggregated locally.',
      );
    if (request.adjustment !== 'unknown')
      throw new ProviderError(
        'unsupported-endpoint',
        'Yahoo corporate-action adjustment is unverified.',
      );
    const market = yahooMarketOf(request.listing.symbol);
    const config = yahooMarkets[market];
    const expected = yahooListing(request.listing.symbol, market);
    const listing = request.listing;
    if (
      expected.id !== listing.id ||
      expected.currency !== listing.currency ||
      expected.timezone !== listing.timezone ||
      !isTradingDate(request.from) ||
      !isTradingDate(request.to) ||
      request.from > request.to
    )
      throw new ProviderError(
        'unsupported-listing',
        'Choose a valid Yahoo listing and history window.',
      );
    const query = new URLSearchParams({
      symbol: listing.symbol,
      from: request.from,
      to: request.to,
    });
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}api/yahoo/history?${query}`, {
        signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch {
      throw new ProviderError(
        signal.aborted ? 'cancelled' : 'network-cors',
        signal.aborted
          ? 'The request was cancelled.'
          : 'Could not reach the local Yahoo relay. Run npm run dev or npm run preview and check your connection.',
      );
    }
    if (signal.aborted)
      throw new ProviderError('cancelled', 'The request was cancelled.');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (signal.aborted)
        throw new ProviderError('cancelled', 'The request was cancelled.');
      throw new ProviderError(
        'unsupported-endpoint',
        'Yahoo needs the local relay provided by npm run dev or npm run preview. Static hosting alone does not include it; you can import a CSV instead.',
      );
    }
    if (signal.aborted)
      throw new ProviderError('cancelled', 'The request was cancelled.');
    if (!response.ok) {
      const categories = {
        400: 'unsupported-listing',
        403: 'unsupported-endpoint',
        404: 'unsupported-listing',
        429: 'quota-exhausted',
      } as const;
      const category =
        categories[response.status as keyof typeof categories] ??
        'provider-outage';
      const messages = {
        'unsupported-listing':
          'Yahoo did not return history for this symbol. Check the ticker or use a CSV import.',
        'unsupported-endpoint':
          'Yahoo rejected this request or the local relay is unavailable. Try a CSV import.',
        'quota-exhausted':
          'Yahoo or the local relay is limiting requests. Try again manually later.',
        'provider-outage':
          'Yahoo history is temporarily unavailable. Your existing chart is retained.',
      };
      throw new ProviderError(category, messages[category]);
    }
    try {
      const chart = object(
        object(payload, 'Yahoo response').chart,
        'Yahoo chart',
      );
      if (chart.error !== null)
        throw new ProviderError(
          'unsupported-listing',
          'Yahoo did not find history for this symbol.',
        );
      if (!Array.isArray(chart.result) || chart.result.length !== 1)
        throw new Error('Invalid result');
      const result = object(chart.result[0], 'Yahoo history');
      const meta = object(result.meta, 'Yahoo metadata');
      if (
        meta.symbol !== listing.symbol ||
        meta.currency !== config.currency ||
        !Object.hasOwn(config.exchanges, String(meta.exchangeName)) ||
        meta.exchangeTimezoneName !== config.timezone ||
        !['EQUITY', 'ETF'].includes(String(meta.instrumentType)) ||
        meta.dataGranularity !== '1d'
      )
        throw new Error('Listing mismatch');
      if (
        !Array.isArray(result.timestamp) ||
        !result.timestamp.length ||
        result.timestamp.length > 5000
      )
        throw new Error('Invalid timestamps');
      const indicators = object(result.indicators, 'Yahoo indicators');
      if (!Array.isArray(indicators.quote) || indicators.quote.length !== 1)
        throw new Error('Invalid quote');
      const quote = object(indicators.quote[0], 'Yahoo quotes');
      for (const field of ['open', 'high', 'low', 'close'])
        if (
          !Array.isArray(quote[field]) ||
          quote[field].length !== result.timestamp.length
        )
          throw new Error('Unaligned quotes');
      if (
        quote.volume !== undefined &&
        quote.volume !== null &&
        (!Array.isArray(quote.volume) ||
          quote.volume.length !== result.timestamp.length)
      )
        throw new Error('Unaligned volume');
      const now = this.now();
      const today = exchangeDate(listing.timezone, now);
      let skipped = 0;
      const candles = normalizeCandles(
        result.timestamp.flatMap((stamp, index): Candle[] => {
          if (typeof stamp !== 'number' || !Number.isInteger(stamp))
            throw new Error('Invalid timestamp');
          const time = exchangeDate(listing.timezone, new Date(stamp * 1000));
          if (time < request.from || time > request.to)
            throw new Error('Out-of-range candle');
          const fields = ['open', 'high', 'low', 'close'].map(
            (field) => (quote[field] as unknown[])[index],
          );
          // Yahoo can return empty or partial slots for sessions with no quote.
          // Skip those sessions rather than rejecting otherwise usable history;
          // never fill in missing prices.
          if (fields.some((value) => value === null)) {
            skipped++;
            return [];
          }
          if (
            fields.some(
              (value) => typeof value !== 'number' || !Number.isFinite(value),
            )
          )
            throw new Error('Invalid OHLC');
          const volume = Array.isArray(quote.volume)
            ? quote.volume[index]
            : null;
          if (
            volume !== null &&
            (typeof volume !== 'number' ||
              !Number.isFinite(volume) ||
              volume < 0)
          )
            throw new Error('Invalid volume');
          return [
            {
              time,
              open: fields[0] as number,
              high: fields[1] as number,
              low: fields[2] as number,
              close: fields[3] as number,
              volume: volume as number | null,
              ...(time >= today ? { incomplete: true } : {}),
            },
          ];
        }),
      );
      if (!candles.length)
        throw new ProviderError(
          'empty-response',
          'Yahoo returned no usable OHLCV bars in this window.',
        );
      const actualListing = validateListing({
        ...listing,
        name:
          typeof meta.longName === 'string'
            ? meta.longName
            : typeof meta.shortName === 'string'
              ? meta.shortName
              : null,
      });
      return validateDataset({
        candles,
        metadata: {
          id: `live:yahoo-finance:${encodeURIComponent(JSON.stringify([listing.id, request.from, request.to]))}`,
          revision: crypto.randomUUID(),
          mode: 'live',
          source: 'Data provided by Yahoo Finance (unofficial connection)',
          provider: this.id,
          listing: actualListing,
          interval: 'daily',
          adjustment: 'unknown',
          requestedRange: { from: request.from, to: request.to },
          coverage: { from: candles[0]!.time, to: candles.at(-1)!.time },
          retrievedAt: now.toISOString(),
          latestCandleTime: candles.at(-1)!.time,
          freshness: 'unknown',
          delay: 'unknown',
          aggregation: null,
          ...(skipped ? { skippedSessions: skipped } : {}),
        },
      });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        'malformed-response',
        `Yahoo returned history the app could not validate (${error instanceof Error ? error.message : 'invalid response'}). It was not loaded.`,
      );
    }
  }
}
