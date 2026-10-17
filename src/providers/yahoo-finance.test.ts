import { expect, it, vi } from 'vitest';
import {
  YahooFinanceProvider,
  yahooListing,
  yahooNseListing,
} from './yahoo-finance';
import type { HistoryRequest } from './types';
import { LiveSession } from './live-session';
import { yahooHistory } from '../../tests/fixtures/yahoo-finance';

const request: HistoryRequest = {
  listing: yahooNseListing('FIXTURE'),
  interval: 'daily',
  adjustment: 'unknown',
  from: '2025-01-01',
  to: '2026-10-12',
  accessProfile: { sessionId: 'fixture', plan: null },
};
const signal = () => new AbortController().signal;
const now = () => new Date('2026-10-12T12:00:00Z');
function provider(payload: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(payload, { status }),
  );
  return {
    api: new YahooFinanceProvider(fetcher, now, '/flipchart/'),
    fetcher,
  };
}

const searchPayload = {
  quotes: [
    {
      exchange: 'NMS',
      quoteType: 'EQUITY',
      symbol: 'AAPL',
      longname: 'Apple Inc.',
      shortname: 'Apple Inc.',
    },
    {
      exchange: 'NYQ',
      quoteType: 'EQUITY',
      symbol: 'BRK-B',
      shortname: 'Berkshire',
    },
    {
      exchange: 'PCX',
      quoteType: 'ETF',
      symbol: 'SPY',
      longname: 'SPDR S&P 500',
    },
    { exchange: 'CME', quoteType: 'FUTURE', symbol: 'STSLA=F' },
    { exchange: 'NMS', quoteType: 'OPTION', symbol: 'AAPL250117C00100000' },
    {
      exchange: 'NSI',
      quoteType: 'EQUITY',
      symbol: 'RELIANCE.NS',
      longname: 'Reliance Industries Limited',
    },
    { exchange: 'BSE', quoteType: 'EQUITY', symbol: 'RELIANCE.BO' },
    null,
  ],
};

it('builds validated listings for NSE and US symbols', () => {
  expect(yahooNseListing('m&m.ns').symbol).toBe('M&M.NS');
  expect(yahooNseListing(' bajaj-auto ').symbol).toBe('BAJAJ-AUTO.NS');
  expect(yahooListing('brk.b', 'us')).toMatchObject({
    id: 'live:yahoo-finance:BRK-B',
    symbol: 'BRK-B',
    currency: 'USD',
    timezone: 'America/New_York',
  });
  for (const value of [
    'AAPL.BO',
    'Reliance Industries',
    'https://localhost/',
    '^NSEI',
    '../secret',
  ])
    expect(() => yahooNseListing(value)).toThrow();
  for (const value of ['^GSPC', 'Apple Inc', 'TOOLONGTICKER1', '1ABC'])
    expect(() => yahooListing(value, 'us')).toThrow();
});

it('searches by name or symbol and keeps only stocks and ETFs on the chosen market', async () => {
  const { api, fetcher } = provider(searchPayload);
  const us = await api.searchSymbol('apple', '', signal(), { market: 'us' });
  expect(us.map((listing) => listing.symbol)).toEqual(['AAPL', 'BRK-B', 'SPY']);
  expect(us[0]).toMatchObject({
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    mic: 'XNAS',
    currency: 'USD',
  });
  expect(us[2]).toMatchObject({ exchange: 'NYSE Arca', mic: 'ARCX' });
  const india = await api.searchSymbol('reliance', '', signal(), {
    market: 'india',
  });
  expect(india).toEqual([
    expect.objectContaining({
      symbol: 'RELIANCE.NS',
      name: 'Reliance Industries Limited',
      exchange: 'NSE',
      currency: 'INR',
    }),
  ]);
  expect(String(fetcher.mock.calls[0]![0])).toBe(
    '/flipchart/api/yahoo/search?q=apple',
  );
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    cache: 'no-store',
    credentials: 'omit',
  });
  // India is the default market.
  expect(
    (await api.searchSymbol('reliance', '', signal())).map((l) => l.symbol),
  ).toEqual(['RELIANCE.NS']);
});

it('falls back to the typed symbol when search is empty or unavailable, but not for names', async () => {
  const empty = provider({ quotes: [] }).api;
  expect(await empty.searchSymbol('fixture', '', signal())).toEqual([
    request.listing,
  ]);
  expect(
    await empty.searchSymbol('fixture', '', signal(), { market: 'us' }),
  ).toEqual([yahooListing('FIXTURE', 'us')]);
  expect(await empty.searchSymbol('no such company', '', signal())).toEqual([]);
  const down = provider({}, 502).api;
  expect(await down.searchSymbol('tcs', '', signal())).toEqual([
    yahooListing('TCS', 'india'),
  ]);
  await expect(
    down.searchSymbol('Tata Consultancy', '', signal()),
  ).rejects.toMatchObject({ category: 'unsupported-endpoint' });
  const malformed = provider({ quotes: 'nope' }).api;
  await expect(
    malformed.searchSymbol('Tata Consultancy', '', signal()),
  ).rejects.toMatchObject({ category: 'malformed-response' });
  const limited = provider({}, 429).api;
  await expect(
    limited.searchSymbol('Tata Consultancy', '', signal()),
  ).rejects.toMatchObject({ category: 'quota-exhausted' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    empty.searchSymbol('fixture', '', controller.signal),
  ).rejects.toMatchObject({ category: 'cancelled' });
});

it('loads US history with USD, New York dates and exchange-code validation', async () => {
  const us = (mutate?: (meta: Record<string, unknown>) => void) => {
    const payload = yahooHistory(3);
    const result = payload.chart.result[0]!;
    Object.assign(result.meta, {
      symbol: 'AAPL',
      currency: 'USD',
      exchangeName: 'NMS',
      exchangeTimezoneName: 'America/New_York',
      longName: 'Apple Inc.',
    });
    mutate?.(result.meta);
    result.timestamp = result.timestamp.map(
      (_, index) => Date.UTC(2025, 0, 2 + index, 15) / 1000,
    );
    return payload;
  };
  const usRequest: HistoryRequest = {
    ...request,
    listing: yahooListing('AAPL', 'us'),
  };
  const data = await provider(us()).api.getOHLCV(usRequest, '', signal());
  expect(data.candles.map((bar) => bar.time)).toEqual([
    '2025-01-02',
    '2025-01-03',
    '2025-01-04',
  ]);
  expect(data.metadata.listing).toMatchObject({
    symbol: 'AAPL',
    currency: 'USD',
    timezone: 'America/New_York',
    name: 'Apple Inc.',
  });
  const mismatches: ((meta: Record<string, unknown>) => void)[] = [
    (meta) => (meta.currency = 'INR'),
    (meta) => (meta.exchangeName = 'NSI'),
    (meta) => (meta.exchangeName = 'SNP'),
    (meta) => (meta.exchangeTimezoneName = 'Asia/Kolkata'),
    (meta) => (meta.instrumentType = 'INDEX'),
  ];
  for (const mutate of mismatches)
    await expect(
      provider(us(mutate)).api.getOHLCV(usRequest, '', signal()),
    ).rejects.toMatchObject({ category: 'malformed-response' });
  // A listing whose currency or zone disagrees with its market is refused up front.
  await expect(
    provider(us()).api.getOHLCV(
      { ...usRequest, listing: { ...usRequest.listing, currency: 'INR' } },
      '',
      signal(),
    ),
  ).rejects.toMatchObject({ category: 'unsupported-listing' });
});

it('loads a keyless session through the base-aware relay and preserves provider OHLC and zero volume', async () => {
  const { api, fetcher } = provider(yahooHistory());
  const session = new LiveSession(api);
  expect(session.connected).toBe(true);
  const data = await session.load(request);
  expect(data.candles[0]).toMatchObject({
    time: '2025-01-01',
    close: 100,
    volume: 0,
  });
  expect(data.metadata).toMatchObject({
    provider: 'yahoo-finance',
    mode: 'live',
    adjustment: 'unknown',
    freshness: 'unknown',
    delay: 'unknown',
    listing: { currency: 'INR', timezone: 'Asia/Kolkata', exchange: 'NSE' },
  });
  const [url, options] = fetcher.mock.calls[0]!;
  expect(String(url)).toMatch(/^\/flipchart\/api\/yahoo\/history\?/);
  expect(options).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  expect(String(url)).not.toMatch(/apikey|credential/);
  await session.load(request);
  expect(fetcher).toHaveBeenCalledTimes(1);
  session.clearCache();
});

it('rejects identity mismatches, malformed arrays, invalid OHLC, and excessive responses', async () => {
  const mutations = [
    (data: ReturnType<typeof yahooHistory>) => {
      data.chart.result[0]!.meta.currency = 'USD';
    },
    (data: ReturnType<typeof yahooHistory>) => {
      data.chart.result[0]!.meta.symbol = 'OTHER.NS';
    },
    (data: ReturnType<typeof yahooHistory>) => {
      data.chart.result[0]!.meta.exchangeName = 'BSE';
    },
    (data: ReturnType<typeof yahooHistory>) => {
      data.chart.result[0]!.indicators.quote[0]!.volume.pop();
    },
    (data: ReturnType<typeof yahooHistory>) => {
      data.chart.result[0]!.indicators.quote[0]!.high[0] = 1;
    },
    (data: ReturnType<typeof yahooHistory>) => {
      data.chart.result[0]!.timestamp[0] = Date.UTC(2024, 0, 1) / 1000;
    },
  ];
  for (const mutate of mutations) {
    const payload = yahooHistory();
    mutate(payload);
    await expect(
      provider(payload).api.getOHLCV(request, '', signal()),
    ).rejects.toMatchObject({ category: 'malformed-response' });
  }
  await expect(
    provider(yahooHistory(5001)).api.getOHLCV(request, '', signal()),
  ).rejects.toMatchObject({ category: 'malformed-response' });
});

it('uses exchange dates, skips completely empty slots, and keeps the current day provisional', async () => {
  const payload = yahooHistory(2);
  payload.chart.result[0]!.timestamp[1] =
    Date.parse('2026-10-11T20:00:00Z') / 1000;
  const data = await provider(payload).api.getOHLCV(request, '', signal());
  expect(data.candles[1]).toMatchObject({
    time: '2026-10-12',
    incomplete: true,
  });
  const empty = structuredClone(payload) as unknown as Record<string, unknown>;
  const raw = empty as {
    chart: { result: { indicators: { quote: Record<string, unknown[]>[] } }[] };
  };
  for (const field of ['open', 'high', 'low', 'close', 'volume'])
    raw.chart.result[0]!.indicators.quote[0]![field]![1] = null;
  expect(
    (await provider(empty).api.getOHLCV(request, '', signal())).candles,
  ).toHaveLength(1);
});

it('skips partially empty slots, accepts the NSE exchange alias and tolerates a missing volume series', async () => {
  const payload = yahooHistory(3);
  const result = payload.chart.result[0]!;
  const quote = result.indicators.quote[0] as unknown as Record<
    string,
    (number | null)[] | undefined
  >;
  quote.close![1] = null;
  result.meta.exchangeName = 'NSE';
  delete quote.volume;
  const data = await provider(payload).api.getOHLCV(request, '', signal());
  expect(data.candles.map((bar) => bar.time)).toEqual([
    '2025-01-01',
    '2025-01-03',
  ]);
  expect(data.candles.every((bar) => bar.volume === null)).toBe(true);
  expect(data.metadata.skippedSessions).toBe(1);
  const clean = await provider(yahooHistory(3)).api.getOHLCV(
    request,
    '',
    signal(),
  );
  expect(clean.metadata.skippedSessions).toBeUndefined();
});

it('names the failed validation in the malformed-response message', async () => {
  const payload = yahooHistory(2);
  payload.chart.result[0]!.indicators.quote[0]!.volume.pop();
  await expect(
    provider(payload).api.getOHLCV(request, '', signal()),
  ).rejects.toMatchObject({
    category: 'malformed-response',
    message: expect.stringContaining('Unaligned volume'),
  });
});

it.each([
  [403, 'unsupported-endpoint'],
  [404, 'unsupported-listing'],
  [429, 'quota-exhausted'],
  [502, 'provider-outage'],
])(
  'maps HTTP %s without retry or demo substitution',
  async (status, category) => {
    const { api, fetcher } = provider({}, Number(status));
    await expect(api.getOHLCV(request, '', signal())).rejects.toMatchObject({
      category,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('explains a missing static-host relay and classifies cancelled requests', async () => {
  const api = new YahooFinanceProvider(
    vi.fn(async () => new Response('<html>App shell</html>')) as typeof fetch,
    now,
  );
  await expect(api.getOHLCV(request, '', signal())).rejects.toMatchObject({
    category: 'unsupported-endpoint',
    message: expect.stringContaining('local relay'),
  });
  const controller = new AbortController();
  controller.abort();
  const aborted = new YahooFinanceProvider(
    vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError');
    }) as typeof fetch,
    now,
  );
  await expect(
    aborted.getOHLCV(request, '', controller.signal),
  ).rejects.toMatchObject({ category: 'cancelled' });
});
