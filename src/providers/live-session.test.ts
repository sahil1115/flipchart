import { afterEach, expect, it, vi } from 'vitest';
import { LiveSession, historyKey, historyRequest } from './live-session';
import type { ConnectedProvider } from './twelve-data';
import { TwelveDataProvider } from './twelve-data';
import {
  fixtureCredential,
  historyResponse,
  listing,
  secondListing,
  request,
  searchResponse,
  usageResponse,
} from '../../tests/fixtures/twelve-data';
import type { Dataset } from '../data/types';
const sessions: LiveSession[] = [];
function setup() {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    return new Response(
      JSON.stringify(
        url.pathname === '/symbol_search'
          ? searchResponse
          : url.pathname === '/api_usage'
            ? usageResponse
            : historyResponse(
                url.searchParams.get('mic_code') === 'XLON'
                  ? secondListing
                  : listing,
              ),
      ),
    );
  });
  const provider = new TwelveDataProvider(
    fetcher,
    () => new Date('2026-10-09T12:00:00Z'),
  );
  const session = new LiveSession(provider);
  session.useCredential(fixtureCredential);
  sessions.push(session);
  return { session, fetcher, provider };
}
afterEach(() => {
  sessions.forEach((session) => session.disconnect());
  sessions.length = 0;
  vi.useRealTimers();
});
it('deduplicates in-flight loads, reuses only matching session/date/request and refreshes manually', async () => {
  const { session, fetcher } = setup();
  const first = session.load(request),
    same = session.load(request);
  expect(same).toBe(first);
  const dataset = await first;
  expect(await session.load(request)).toBe(dataset);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await session.load(request, true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await session.load({ ...request, adjustment: 'adjusted' });
  expect(fetcher).toHaveBeenCalledTimes(3);
  await session.load({ ...request, listing: secondListing });
  expect(fetcher).toHaveBeenCalledTimes(4);
  await session.load({ ...request, from: '2025-01-01' });
  expect(fetcher).toHaveBeenCalledTimes(5);
  session.useCredential('second-fixture-not-a-real-key');
  await session.load(request);
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(
    JSON.stringify(
      session.queries
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ),
  ).not.toContain(fixtureCredential);
});
it('changes the reuse key at exchange-date boundaries without automatic requests', async () => {
  const { session, fetcher } = setup();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  await session.load(request);
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await session.load(request);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('bounds successful caches and clears all authenticated state on disconnect', async () => {
  const { session } = setup();
  for (let i = 0; i < 8; i++)
    await session.load({
      ...request,
      from: `2024-01-0${i + 1}` as typeof request.from,
    });
  expect(session.queries.getQueryCache().getAll()).toHaveLength(5);
  const defaults = session.queries.getDefaultOptions().queries;
  expect(defaults).toMatchObject({
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  session.disconnect();
  expect(session.connected).toBe(false);
  expect(session.queries.getQueryCache().getAll()).toEqual([]);
});
it('cancels obsolete requests even if the transport ignores abort; newer selections win', async () => {
  const normalized = await setup().provider.getOHLCV(
    request,
    fixtureCredential,
    new AbortController().signal,
  );
  let finish: (dataset: Dataset) => void = () => {};
  const history = vi
    .fn<ConnectedProvider['getOHLCV']>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      ...normalized,
      metadata: { ...normalized.metadata, listing: secondListing },
    });
  const provider = {
    id: 'twelve-data',
    getOHLCV: history,
    searchSymbol: vi.fn(),
    getCapabilities: vi.fn(),
    testConnection: vi.fn(),
  } as ConnectedProvider;
  const session = new LiveSession(provider, fixtureCredential);
  sessions.push(session);
  const old = session.load(request);
  const rejected = expect(old).rejects.toHaveProperty('category', 'cancelled');
  const newer = await session.load({ ...request, listing: secondListing });
  finish(normalized);
  await rejected;
  expect(newer.metadata.listing.exchange).toBe('LSE');
  expect(history.mock.calls[0]![2].aborted).toBe(true);
  expect(
    session.queries
      .getQueryCache()
      .getAll()
      .some(
        (query) =>
          (query.state.data as Dataset | undefined)?.metadata.listing
            .exchange === 'NASDAQ',
      ),
  ).toBe(false);
});
it('bounds failed query entries as well as successful datasets', async () => {
  const { session, fetcher } = setup();
  fetcher.mockImplementation(
    async () => new Response(JSON.stringify({ status: 'error', code: 429 })),
  );
  for (let i = 0; i < 8; i++)
    await expect(
      session.load({
        ...request,
        from: `2024-01-0${i + 1}` as typeof request.from,
      }),
    ).rejects.toHaveProperty('category', 'quota-exhausted');
  expect(session.queries.getQueryCache().getAll()).toHaveLength(5);
});
it('abort/disconnect prevent slow search and connection-test results from applying', async () => {
  const { session, provider } = setup();
  let resolveSearch: (value: typeof searchResponse) => void = () => {};
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSearch = (value) => resolve(new Response(JSON.stringify(value)));
      }),
  );
  const slow = new LiveSession(
    new TwelveDataProvider(fetcher),
    fixtureCredential,
  );
  sessions.push(slow);
  const search = slow.search('FI');
  slow.cancel();
  resolveSearch(searchResponse);
  await expect(search).rejects.toHaveProperty('category', 'cancelled');
  const spy = vi.spyOn(provider, 'testConnection').mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              checkedAt: '2026-10-09T12:00:00Z',
              usage: 1,
              limit: 8,
              plan: 'old',
            }),
          10,
        ),
      ),
  );
  const test = session.testConnection();
  session.disconnect();
  await expect(test).rejects.toHaveProperty('category', 'cancelled');
  expect(spy.mock.calls[0]![1].aborted).toBe(true);
});
it('includes every non-secret identity/range/convention in query keys and adds full-history warm-up', () => {
  const key = historyKey('twelve-data', request, '2026-10-09');
  expect(key).toContain(request.listing.exchange);
  expect(key).toContain(request.interval);
  expect(key).toContain(request.adjustment);
  expect(key).toContain(request.from);
  expect(key).toContain(request.accessProfile.sessionId);
  const basic = historyRequest(
    listing,
    '1Y',
    'raw',
    request.accessProfile,
    500,
    new Date('2026-10-09T12:00:00Z'),
  );
  const longer = historyRequest(
    listing,
    '1Y',
    'raw',
    request.accessProfile,
    2300,
    new Date('2026-10-09T12:00:00Z'),
  );
  expect(basic.to).toBe('2026-10-09');
  expect(basic.from < '2025-10-09').toBe(true);
  expect(longer.from < basic.from).toBe(true);
});
