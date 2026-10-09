import { describe, expect, it, vi } from 'vitest';
import {
  historyResponse,
  searchResponse,
  usageResponse,
  fixtureCredential,
  request,
  listing,
} from '../../tests/fixtures/twelve-data';
import { TwelveDataProvider } from './twelve-data';
const now = () => new Date('2026-10-09T12:00:00Z');
const signal = () => new AbortController().signal;
function setup(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(payload), { status, headers }),
    );
  return { fetcher, provider: new TwelveDataProvider(fetcher, now) };
}
it('normalizes daily exchange dates and full OHLC, projects metadata and preserves missing/zero volume', async () => {
  const { provider, fetcher } = setup(historyResponse());
  const data = await provider.getOHLCV(request, fixtureCredential, signal());
  expect(data.candles).toHaveLength(240);
  expect(data.candles[3]!.volume).toBeNull();
  expect(data.candles[4]!.volume).toBe(0);
  expect(data.metadata).toMatchObject({
    mode: 'live',
    provider: 'twelve-data',
    source: 'Data provided by Twelve Data',
    adjustment: 'raw',
    listing,
    delay: 'unknown',
    freshness: 'unknown',
    requestedRange: { from: request.from, to: request.to },
    retrievedAt: now().toISOString(),
  });
  const [url, options] = fetcher.mock.calls[0]!;
  const parameters = new URL(String(url)).searchParams;
  expect(parameters.get('interval')).toBe('1day');
  expect(parameters.get('mic_code')).toBe('XNAS');
  expect(parameters.get('adjust')).toBe('none');
  expect(parameters.get('outputsize')).toBe('5000');
  expect(String(url)).not.toContain(fixtureCredential);
  expect(options?.headers).toEqual({
    Authorization: `apikey ${fixtureCredential}`,
  });
  expect(options?.cache).toBe('no-store');
  expect(JSON.stringify(data)).not.toContain(fixtureCredential);
});
it('requests all-OHLC adjustment, never replaces only close, and marks same-day daily bars provisional', async () => {
  const { provider, fetcher } = setup(
    historyResponse(listing, 3, '2026-10-09'),
  );
  const data = await provider.getOHLCV(
    { ...request, adjustment: 'adjusted' },
    fixtureCredential,
    signal(),
  );
  expect(
    new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('adjust'),
  ).toBe('all');
  expect(data.candles.at(-1)).toMatchObject({
    open: 100.2,
    high: 102.2,
    low: 99.2,
    close: 101.2,
    incomplete: true,
  });
  expect(data.metadata.adjustment).toBe('adjusted');
});
it('returns exchange-aware stock/ETF listings independently from history; access stays unknown', async () => {
  const { provider } = setup(searchResponse);
  const matches = await provider.searchSymbol(
    'FI',
    fixtureCredential,
    signal(),
  );
  expect(matches).toHaveLength(2);
  expect(matches[0]!.id).not.toBe(matches[1]!.id);
  expect(matches.map((match) => match.currency)).toEqual(['USD', 'GBP']);
  expect(provider.getCapabilities()).toMatchObject({
    access: 'unknown',
    intervals: ['daily'],
    historyLimit: { maxBars: 5000, earliestDate: null },
  });
});
it('connection test reports only actual provider usage and never infers listing entitlements', async () => {
  const { provider } = setup(usageResponse);
  expect(await provider.testConnection(fixtureCredential, signal())).toEqual({
    checkedAt: now().toISOString(),
    usage: 2,
    limit: 8,
    plan: 'fixture-basic',
  });
});
describe('typed failure paths and redaction', () => {
  for (const [code, message, category] of [
    [401, 'bad key', 'invalid-key'],
    [429, 'quota', 'quota-exhausted'],
    [403, 'premium', 'unsupported-endpoint'],
    [404, 'unknown', 'unsupported-listing'],
    [400, 'unsupported interval', 'unsupported-interval'],
    [400, 'insufficient history', 'insufficient-history'],
    [400, 'no data available', 'empty-response'],
    [500, 'outage', 'provider-outage'],
  ] as const)
    it(`maps HTTP and successful-HTTP payload code ${code}: ${category}`, async () => {
      for (const status of [200, code]) {
        const { provider } = setup(
          {
            status: 'error',
            code,
            message: `${message} https://example.test/?apikey=${fixtureCredential}`,
          },
          status,
        );
        try {
          await provider.getOHLCV(request, fixtureCredential, signal());
          throw new Error('expected failure');
        } catch (error) {
          expect(error).toMatchObject({ category });
          expect(String(error)).not.toContain(fixtureCredential);
          expect(String(error)).not.toContain('example.test');
        }
      }
    });
  it('uses only a supplied valid Retry-After time, without inventing quota/reset counters', async () => {
    const { provider } = setup({ status: 'error', code: 429 }, 200, {
      'Retry-After': '60',
    });
    await expect(
      provider.getOHLCV(request, fixtureCredential, signal()),
    ).rejects.toMatchObject({ retryAt: '2026-10-09T12:01:00.000Z' });
    const absent = setup({ status: 'error', code: 429 }).provider;
    await expect(
      absent.getOHLCV(request, fixtureCredential, signal()),
    ).rejects.toMatchObject({ retryAt: null });
  });
  it('handles empty, malformed, mismatched listing, unavailable metadata and material candle errors', async () => {
    for (const payload of [
      {},
      { ...historyResponse(), values: [] },
      {
        ...historyResponse(),
        meta: { ...historyResponse().meta, mic_code: 'WRONG' },
      },
      {
        ...historyResponse(),
        meta: { ...historyResponse().meta, currency: null },
      },
      {
        ...historyResponse(),
        values: [
          {
            datetime: '2026-10-08',
            open: '2',
            high: '1',
            low: '0',
            close: '3',
          },
        ],
      },
    ]) {
      const { provider } = setup(payload);
      await expect(
        provider.getOHLCV(request, fixtureCredential, signal()),
      ).rejects.toHaveProperty(
        'category',
        Array.isArray((payload as { values?: unknown[] }).values) &&
          (payload as { values: unknown[] }).values.length === 0
          ? 'empty-response'
          : 'malformed-response',
      );
    }
  });
  it('rejects reflected secrets in metadata and non-JSON responses without retaining them', async () => {
    const reflected = setup({
      ...historyResponse(),
      meta: { ...historyResponse().meta, exchange_timezone: fixtureCredential },
    }).provider;
    await expect(
      reflected.getOHLCV(request, fixtureCredential, signal()),
    ).rejects.toHaveProperty('category', 'malformed-response');
    const provider = new TwelveDataProvider(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(fixtureCredential)),
      now,
    );
    await expect(
      provider.getOHLCV(request, fixtureCredential, signal()),
    ).rejects.toHaveProperty('category', 'malformed-response');
  });
  it('distinguishes network/CORS from cancellation and rejects missing keys before requesting', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`network ${fixtureCredential}`));
    const provider = new TwelveDataProvider(fetcher, now);
    await expect(
      provider.getOHLCV(request, '', signal()),
    ).rejects.toHaveProperty('category', 'missing-key');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      provider.getOHLCV(request, fixtureCredential, signal()),
    ).rejects.toHaveProperty('category', 'network-cors');
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.getOHLCV(request, fixtureCredential, controller.signal),
    ).rejects.toHaveProperty('category', 'cancelled');
  });
});
