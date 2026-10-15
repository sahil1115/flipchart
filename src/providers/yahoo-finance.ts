import { isTradingDate, normalizeCandles } from '../data/normalize';
import { object, validateDataset, validateListing } from '../data/validate';
import type { Candle, Dataset, Listing } from '../data/types';
import type { HistoryRequest, ProviderCapabilities } from './types';
import { ProviderError } from './types';
import { exchangeDate } from './twelve-data';
import type { ConnectedProvider, ConnectionReport } from './twelve-data';

export function yahooNseListing(query: string): Listing {
  const symbol = `${query.trim().toUpperCase().replace(/\.NS$/, '')}.NS`;
  if (!/^[A-Z0-9][A-Z0-9&_-]{0,39}\.NS$/.test(symbol))
    throw new ProviderError(
      'unsupported-listing',
      'Enter an NSE trading symbol, such as RELIANCE.NS, TCS.NS, or M&M.NS. Company-name search is not supported.',
    );
  return {
    id: `live:yahoo-finance:${symbol}`,
    symbol,
    name: null,
    exchange: 'NSE',
    mic: 'XNSE',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };
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
  ): Promise<Listing[]> {
    if (signal.aborted)
      throw new ProviderError('cancelled', 'The request was cancelled.');
    return [yahooNseListing(query)];
  }
  getCapabilities(): ProviderCapabilities {
    return {
      intervals: ['daily'],
      adjustmentModes: ['unknown'],
      historyLimit: { maxBars: 5000, earliestDate: null },
      access: 'unknown',
      unavailableFeatures: [
        'Daily NSE history only; availability is verified when you load.',
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
    const listing = yahooNseListing(request.listing.symbol);
    if (
      listing.id !== request.listing.id ||
      !isTradingDate(request.from) ||
      !isTradingDate(request.to) ||
      request.from > request.to
    )
      throw new ProviderError(
        'unsupported-listing',
        'Choose a valid NSE listing and history window.',
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
          'Yahoo did not return history for this NSE symbol. Check the trading symbol or use a CSV import.',
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
          'Yahoo did not find history for this NSE symbol.',
        );
      if (!Array.isArray(chart.result) || chart.result.length !== 1)
        throw new Error('Invalid result');
      const result = object(chart.result[0], 'Yahoo history');
      const meta = object(result.meta, 'Yahoo metadata');
      if (
        meta.symbol !== listing.symbol ||
        meta.currency !== 'INR' ||
        !['NSI', 'NSE'].includes(String(meta.exchangeName)) ||
        meta.exchangeTimezoneName !== 'Asia/Kolkata' ||
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
        `Yahoo returned NSE history the app could not validate (${error instanceof Error ? error.message : 'invalid response'}). It was not loaded.`,
      );
    }
  }
}
