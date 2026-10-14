import { expect, it, vi } from 'vitest';
import { YahooFinanceProvider, yahooNseListing } from './yahoo-finance';
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

it('accepts NSE symbols including ampersands without fetching during selection', async () => {
  const { api, fetcher } = provider(yahooHistory());
  expect(yahooNseListing('m&m.ns').symbol).toBe('M&M.NS');
  expect(yahooNseListing(' bajaj-auto ').symbol).toBe('BAJAJ-AUTO.NS');
  for (const value of [
    'AAPL.BO',
    'Reliance Industries',
    'https://localhost/',
    '^NSEI',
    '../secret',
  ])
    expect(() => yahooNseListing(value)).toThrow();
  expect(await api.searchSymbol('fixture', '', signal())).toEqual([
    request.listing,
  ]);
  expect(fetcher).not.toHaveBeenCalled();
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
