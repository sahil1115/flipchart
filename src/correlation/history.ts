import { isTradingDate } from '../data/normalize';
import type { TradingDate } from '../data/types';
import { object } from '../data/validate';
import { exchangeDate } from '../providers/twelve-data';
import { ProviderError } from '../providers/types';
import type { Market } from './markets';

export interface CloseSeries {
  symbol: string;
  /** Finalized sessions only: the current exchange date is excluded. */
  closes: Map<TradingDate, number>;
}

/** Calendar lookback that covers 30 trading-day returns across holidays. */
export const lookbackDays = 75;

export function historyWindow(
  market: Market,
  now: Date = new Date(),
  days: number = lookbackDays,
) {
  const to = exchangeDate(market.timezone, now);
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString().slice(0, 10) as TradingDate, to };
}

const statusMessages: Record<number, [ProviderError['category'], string]> = {
  400: [
    'unsupported-listing',
    'Yahoo did not accept this ticker. Check the symbol.',
  ],
  403: [
    'unsupported-endpoint',
    'Yahoo rejected this request or the local relay is unavailable.',
  ],
  404: ['unsupported-listing', 'Yahoo did not return history for this ticker.'],
  429: [
    'quota-exhausted',
    'Yahoo or the local relay is limiting requests. Try again in a minute.',
  ],
};

/** Daily closes through the same-origin Yahoo relay, validated against the market. */
export async function fetchCloses(
  market: Market,
  ticker: string,
  signal: AbortSignal,
  {
    fetcher = (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    base = import.meta.env.BASE_URL,
    now = new Date(),
    lookback = lookbackDays,
  }: {
    fetcher?: typeof fetch;
    base?: string;
    now?: Date;
    /** Calendar days of history to request. */
    lookback?: number;
  } = {},
): Promise<CloseSeries> {
  const symbol = `${ticker}${market.suffix}`;
  const { from, to } = historyWindow(market, now, lookback);
  const cancelled = () =>
    new ProviderError('cancelled', 'The request was cancelled.');
  let response: Response;
  try {
    response = await fetcher(
      `${base}api/yahoo/history?${new URLSearchParams({ symbol, from, to })}`,
      { signal, cache: 'no-store', credentials: 'omit' },
    );
  } catch {
    if (signal.aborted) throw cancelled();
    throw new ProviderError(
      'network-cors',
      'Could not reach the local Yahoo relay. Run npm run dev or npm run preview and check your connection.',
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (signal.aborted) throw cancelled();
    throw new ProviderError(
      'unsupported-endpoint',
      'This page needs the local Yahoo relay provided by npm run dev or npm run preview. Static hosting alone does not include it.',
    );
  }
  if (signal.aborted) throw cancelled();
  if (!response.ok) {
    const [category, message] = statusMessages[response.status] ?? [
      'provider-outage',
      'Yahoo history is temporarily unavailable.',
    ];
    throw new ProviderError(category, message);
  }
  try {
    const chart = object(object(payload, 'Yahoo response').chart, 'chart');
    if (chart.error !== null)
      throw new ProviderError(
        'unsupported-listing',
        'Yahoo did not find history for this ticker.',
      );
    if (!Array.isArray(chart.result) || chart.result.length !== 1)
      throw new Error('Invalid result');
    const result = object(chart.result[0], 'history');
    const meta = object(result.meta, 'metadata');
    if (
      meta.symbol !== symbol ||
      meta.currency !== market.currency ||
      meta.exchangeTimezoneName !== market.timezone ||
      !['EQUITY', 'ETF'].includes(String(meta.instrumentType)) ||
      meta.dataGranularity !== '1d'
    )
      throw new Error('Listing does not match the selected market');
    const stamps = result.timestamp;
    if (!Array.isArray(stamps) || stamps.length > 5000)
      throw new Error('Invalid timestamps');
    const quote = object(
      (object(result.indicators, 'indicators').quote as unknown[])?.[0],
      'quote',
    );
    const close = quote.close;
    if (!Array.isArray(close) || close.length !== stamps.length)
      throw new Error('Unaligned closes');
    const today = exchangeDate(market.timezone, now);
    const closes = new Map<TradingDate, number>();
    stamps.forEach((stamp, index) => {
      if (typeof stamp !== 'number' || !Number.isInteger(stamp))
        throw new Error('Invalid timestamp');
      const date = exchangeDate(market.timezone, new Date(stamp * 1000));
      const value = close[index];
      // Skip missing sessions and the in-progress day; never fill prices.
      if (value === null || date >= today) return;
      if (
        !isTradingDate(date) ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0
      )
        throw new Error('Invalid close');
      const existing = closes.get(date);
      if (existing !== undefined && existing !== value)
        throw new Error('Conflicting duplicate session');
      closes.set(date, value);
    });
    if (!closes.size)
      throw new ProviderError(
        'empty-response',
        'Yahoo returned no finalized closes for this ticker.',
      );
    return { symbol: ticker, closes };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      'malformed-response',
      `Yahoo returned history that could not be validated (${error instanceof Error ? error.message : 'invalid response'}).`,
    );
  }
}

export interface LoadedCloses {
  series: CloseSeries[];
  failures: { ticker: string; message: string }[];
}

// Session-only memory cache; keyed by exchange date so data refreshes daily.
const cache = new Map<string, CloseSeries>();
const cacheLimit = 80;
export function clearCloseCache() {
  cache.clear();
}

/**
 * Loads tickers two at a time (the relay's concurrency limit), in their given
 * order. A failed ticker is reported and excluded; cancellation stops all.
 */
export async function loadCloses(
  market: Market,
  tickers: readonly string[],
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void = () => {},
  options: Parameters<typeof fetchCloses>[3] = {},
): Promise<LoadedCloses> {
  const day = exchangeDate(market.timezone, options.now ?? new Date());
  const results: (CloseSeries | { ticker: string; message: string })[] = [];
  let next = 0,
    done = 0;
  const worker = async () => {
    while (next < tickers.length) {
      const index = next++;
      const ticker = tickers[index]!;
      const key = `${market.id}:${ticker}:${day}:${options.lookback ?? lookbackDays}`;
      try {
        let series = cache.get(key);
        if (!series) {
          series = await fetchCloses(market, ticker, signal, options);
          if (cache.size >= cacheLimit)
            cache.delete(cache.keys().next().value!);
          cache.set(key, series);
        }
        results[index] = series;
      } catch (error) {
        if (signal.aborted) throw error;
        results[index] = {
          ticker,
          message:
            error instanceof ProviderError
              ? error.message
              : 'The request failed.',
        };
      }
      onProgress(++done, tickers.length);
    }
  };
  await Promise.all([worker(), worker()]);
  if (signal.aborted)
    throw new ProviderError('cancelled', 'The request was cancelled.');
  return {
    series: results.filter((item): item is CloseSeries => 'closes' in item),
    failures: results.filter(
      (item): item is { ticker: string; message: string } => 'message' in item,
    ),
  };
}
