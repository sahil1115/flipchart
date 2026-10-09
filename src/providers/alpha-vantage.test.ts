import { expect, it, vi } from 'vitest';
import { AlphaVantageProvider } from './alpha-vantage';
import {
  alphaHistory,
  alphaRequest,
  alphaSearch,
  alphaCredential,
} from '../../tests/fixtures/alpha-vantage';
import { historyKey } from './live-session';
const signal = () => new AbortController().signal;
function setup(payload: unknown, status = 200) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response(JSON.stringify(payload), { status }),
    );
  return {
    fetcher,
    provider: new AlphaVantageProvider(
      fetcher,
      () => new Date('2026-10-09T12:00:00Z'),
    ),
  };
}
it('keeps provider-native symbols, regions and currency without inventing exchange or IANA timezone', async () => {
  const { provider } = setup(alphaSearch);
  const [listing] = await provider.searchSymbol(
    'FIX',
    alphaCredential,
    signal(),
  );
  expect(listing).toMatchObject({
    symbol: 'FIX.LON',
    region: 'United Kingdom',
    currency: 'GBP',
    exchange: null,
    mic: null,
    timezone: null,
  });
  const report = await provider.testConnection(alphaCredential, signal());
  expect(report).toMatchObject({ usage: null, limit: null, plan: null });
  expect(provider.getCapabilities()).toMatchObject({
    intervals: ['daily', 'weekly', 'monthly'],
    adjustmentModes: ['raw'],
    access: 'unknown',
  });
});
it.each(['daily', 'weekly', 'monthly'] as const)(
  'normalizes native %s raw OHLCV with original trading-date labels and unknown/zero volume',
  async (interval) => {
    const { provider, fetcher } = setup(alphaHistory(interval));
    const data = await provider.getOHLCV(
      { ...alphaRequest, interval },
      alphaCredential,
      signal(),
    );
    expect(data.candles).toHaveLength(100);
    expect(data.metadata).toMatchObject({
      interval,
      adjustment: 'raw',
      provider: 'alpha-vantage',
      listing: { timezone: 'Europe/London', currency: 'GBP', exchange: null },
      delay: 'unknown',
    });
    expect(data.candles.at(-1)).toMatchObject({
      time: '2026-10-08',
      open: 100,
      close: 101,
    });
    expect(data.candles.some((bar) => bar.volume === null)).toBe(true);
    expect(data.candles.some((bar) => bar.volume === 0)).toBe(true);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('function')).toBe(
      `TIME_SERIES_${interval.toUpperCase()}`,
    );
    expect(options).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
    expect(JSON.stringify(data)).not.toContain(alphaCredential);
    if (interval !== 'daily')
      expect(data.candles.at(-1)?.incomplete).toBe(true);
  },
);
it('separates compact/premium requests and rejects adjusted OHLC before fetching', async () => {
  const { provider, fetcher } = setup(alphaHistory());
  await provider.getOHLCV(
    { ...alphaRequest, historySize: 'full' },
    alphaCredential,
    signal(),
  );
  expect(
    new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('outputsize'),
  ).toBe('full');
  expect(
    historyKey(
      'alpha-vantage',
      { ...alphaRequest, historySize: 'full' },
      '2026-10-09',
    ),
  ).not.toEqual(
    historyKey(
      'alpha-vantage',
      { ...alphaRequest, historySize: 'compact' },
      '2026-10-09',
    ),
  );
  await expect(
    provider.getOHLCV(
      { ...alphaRequest, adjustment: 'adjusted' },
      alphaCredential,
      signal(),
    ),
  ).rejects.toMatchObject({ category: 'unsupported-endpoint' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [{ Information: 'Invalid API key secret' }, 200, 'invalid-key'],
  [
    { Note: 'API call frequency / rate limit; subscribe to premium secret' },
    200,
    'quota-exhausted',
  ],
  [
    { Information: 'premium outputsize full secret' },
    200,
    'unsupported-endpoint',
  ],
  [
    { 'Error Message': 'Invalid API call symbol secret' },
    200,
    'unsupported-listing',
  ],
  [{}, 500, 'provider-outage'],
  [{}, 429, 'quota-exhausted'],
  [{}, 403, 'unsupported-endpoint'],
  [{}, 200, 'malformed-response'],
] as const)(
  'maps HTTP and JSON provider errors without reflecting message text',
  async (payload, status, category) => {
    const { provider } = setup(payload, status);
    await expect(
      provider.getOHLCV(alphaRequest, alphaCredential, signal()),
    ).rejects.toMatchObject({ category });
    await expect(
      provider.getOHLCV(alphaRequest, alphaCredential, signal()),
    ).rejects.not.toThrow('secret');
  },
);
it('rejects empty/range/malformed identity, credential reflection, inconsistent prices and native listing mismatches', async () => {
  const empty = setup(alphaHistory('daily', 0));
  await expect(
    empty.provider.getOHLCV(alphaRequest, alphaCredential, signal()),
  ).rejects.toMatchObject({ category: 'empty-response' });
  for (const patch of [
    { from: '2027-01-01' },
    { interval: 'intraday' },
    { listing: { ...alphaRequest.listing, id: 'live:twelve-data:FIX' } },
  ]) {
    await expect(
      setup(alphaHistory()).provider.getOHLCV(
        { ...alphaRequest, ...patch } as typeof alphaRequest,
        alphaCredential,
        signal(),
      ),
    ).rejects.toBeInstanceOf(Error);
  }
  for (const payload of [
    {
      ...alphaHistory(),
      'Meta Data': { '2. Symbol': 'OTHER', '5. Time Zone': 'Europe/London' },
    },
    {
      ...alphaHistory(),
      'Meta Data': { '2. Symbol': 'FIX.LON', '5. Time Zone': alphaCredential },
    },
    {
      ...alphaHistory(),
      'Time Series (Daily)': {
        '2026-10-08': {
          '1. open': 'NaN',
          '2. high': '1',
          '3. low': '2',
          '4. close': '3',
          '5. volume': '-1',
        },
      },
    },
  ])
    await expect(
      setup(payload).provider.getOHLCV(alphaRequest, alphaCredential, signal()),
    ).rejects.toMatchObject({ category: 'malformed-response' });
});
it('handles missing keys, cancellation and network/CORS without exposing transport URLs', async () => {
  const { provider, fetcher } = setup(alphaHistory());
  await expect(
    provider.getOHLCV(alphaRequest, '', signal()),
  ).rejects.toMatchObject({ category: 'missing-key' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    provider.getOHLCV(alphaRequest, alphaCredential, controller.signal),
  ).rejects.toMatchObject({ category: 'cancelled' });
  fetcher.mockRejectedValue(new Error(`url apikey=${alphaCredential}`));
  await expect(
    provider.getOHLCV(alphaRequest, alphaCredential, signal()),
  ).rejects.toMatchObject({ category: 'network-cors' });
});
