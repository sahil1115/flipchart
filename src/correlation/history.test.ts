import { beforeEach, expect, it, vi } from 'vitest';
import {
  clearCloseCache,
  fetchCloses,
  historyWindow,
  loadCloses,
} from './history';
import { findMarket } from './markets';

const now = new Date('2026-10-15T15:00:00Z');
const us = findMarket('sp500');
const nse = findMarket('nse');
/** Daily bars ending on October `endDay`, one per calendar day. */
function chart(
  symbol: string,
  closes: (number | null)[],
  {
    meta = {},
    hourUtc = 14,
    endDay = 14,
  }: { meta?: Record<string, unknown>; hourUtc?: number; endDay?: number } = {},
) {
  const start = Date.UTC(2026, 9, endDay - closes.length + 1, hourUtc, 30);
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol,
            currency: 'USD',
            exchangeTimezoneName: 'America/New_York',
            instrumentType: 'EQUITY',
            dataGranularity: '1d',
            ...meta,
          },
          timestamp: closes.map((_, i) => start / 1000 + i * 86400),
          indicators: { quote: [{ close: closes }] },
        },
      ],
    },
  };
}
const respond = (payload: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
const signal = () => new AbortController().signal;
beforeEach(() => clearCloseCache());

it('requests a 75-day window ending on the exchange date through the relay', async () => {
  expect(historyWindow(us, now)).toEqual({
    from: '2026-08-01',
    to: '2026-10-15',
  });
  const fetcher = respond(chart('AAPL', [1, 2, 3]));
  await fetchCloses(us, 'AAPL', signal(), { fetcher, base: '/app/', now });
  const url = new URL(String(fetcher.mock.calls[0]![0]), 'http://x');
  expect(url.pathname).toBe('/app/api/yahoo/history');
  expect(url.searchParams.get('symbol')).toBe('AAPL');
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' });
});

it('can request a longer window and caches each window separately', async () => {
  expect(historyWindow(us, now, 310)).toEqual({
    from: '2025-12-09',
    to: '2026-10-15',
  });
  const fetcher = respond(chart('SPY', [1, 2, 3]));
  const options = { fetcher, now };
  await loadCloses(us, ['SPY'], signal(), undefined, options);
  await loadCloses(us, ['SPY'], signal(), undefined, {
    ...options,
    lookback: 310,
  });
  await loadCloses(us, ['SPY'], signal(), undefined, {
    ...options,
    lookback: 310,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const url = new URL(String(fetcher.mock.calls[1]![0]), 'http://x');
  expect(url.searchParams.get('from')).toBe('2025-12-09');
});

it('keeps finalized closes, skips missing sessions and today, and appends the NSE suffix', async () => {
  const result = await fetchCloses(us, 'AAPL', signal(), {
    fetcher: respond(chart('AAPL', [10, null, 12, 13], { endDay: 15 })),
    now,
  });
  expect([...result.closes]).toEqual([
    ['2026-10-12', 10],
    ['2026-10-14', 12],
  ]);
  const fetcher = respond(
    chart('TCS.NS', [5, 6], {
      meta: { currency: 'INR', exchangeTimezoneName: 'Asia/Kolkata' },
      hourUtc: 4,
    }),
  );
  const india = await fetchCloses(nse, 'TCS', signal(), { fetcher, now });
  expect(india.symbol).toBe('TCS');
  expect([...india.closes.keys()]).toEqual(['2026-10-13', '2026-10-14']);
  expect(String(fetcher.mock.calls[0]![0])).toContain('symbol=TCS.NS');
});

it('rejects data that does not match the selected market', async () => {
  for (const meta of [
    { currency: 'INR' },
    { exchangeTimezoneName: 'Europe/London' },
    { symbol: 'MSFT' },
    { dataGranularity: '1wk' },
  ])
    await expect(
      fetchCloses(us, 'AAPL', signal(), {
        fetcher: respond(chart('AAPL', [1, 2], { meta })),
        now,
      }),
    ).rejects.toMatchObject({ category: 'malformed-response' });
  await expect(
    fetchCloses(us, 'AAPL', signal(), {
      fetcher: respond(chart('AAPL', [1, -2])),
      now,
    }),
  ).rejects.toMatchObject({ category: 'malformed-response' });
});

it('maps relay failures and a missing relay to clear messages', async () => {
  await expect(
    fetchCloses(us, 'AAPL', signal(), { fetcher: respond({}, 429), now }),
  ).rejects.toMatchObject({ category: 'quota-exhausted' });
  await expect(
    fetchCloses(us, 'AAPL', signal(), {
      fetcher: vi.fn(async () => new Response('<html>')) as typeof fetch,
      now,
    }),
  ).rejects.toMatchObject({
    category: 'unsupported-endpoint',
    message: expect.stringContaining('local Yahoo relay'),
  });
});

it('loads two at a time in order, reports failures, and reuses the session cache', async () => {
  let active = 0,
    peak = 0;
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const symbol = new URL(String(input), 'http://x').searchParams.get(
      'symbol',
    )!;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return symbol === 'BAD'
      ? Response.json({}, { status: 404 })
      : Response.json(chart(symbol, [1, 2, 3]));
  });
  const progress: number[] = [];
  const loaded = await loadCloses(
    us,
    ['AAPL', 'BAD', 'MSFT', 'NVDA'],
    signal(),
    (done) => progress.push(done),
    { fetcher, now },
  );
  expect(peak).toBe(2);
  expect(loaded.series.map((item) => item.symbol)).toEqual([
    'AAPL',
    'MSFT',
    'NVDA',
  ]);
  expect(loaded.failures).toEqual([
    { ticker: 'BAD', message: expect.stringContaining('did not return') },
  ]);
  expect(progress).toEqual([1, 2, 3, 4]);
  await loadCloses(us, ['AAPL', 'MSFT'], signal(), undefined, {
    fetcher,
    now,
  });
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('stops everything when cancelled', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>(async () => {
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  });
  await expect(
    loadCloses(us, ['AAPL', 'MSFT'], controller.signal, undefined, {
      fetcher,
      now,
    }),
  ).rejects.toMatchObject({ category: 'cancelled' });
});
