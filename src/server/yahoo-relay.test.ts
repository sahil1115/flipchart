import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createYahooRelay } from './yahoo-relay';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function relay(fetcher: typeof fetch, base = '/') {
  const handler = createYahooRelay(base, fetcher);
  const server = createServer((req, res) =>
    handler(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No server address');
  return `http://127.0.0.1:${address.port}`;
}
const query = 'symbol=M%26M.NS&from=2025-01-01&to=2025-02-01';

it('relays only the fixed Yahoo chart endpoint, respects base paths, and never caches', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ chart: { result: [], error: null } }),
  );
  const origin = await relay(fetcher, '/flipchart/');
  const result = await fetch(`${origin}/flipchart/api/yahoo/history?${query}`, {
    headers: { Origin: origin },
  });
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.origin).toBe('https://query1.finance.yahoo.com');
  expect(url.pathname).toBe('/v8/finance/chart/M%26M.NS');
  expect(url.searchParams.get('interval')).toBe('1d');
  expect(Number(url.searchParams.get('period1'))).toBe(
    Date.parse('2025-01-01T00:00:00+05:30') / 1000,
  );
  expect(Number(url.searchParams.get('period2'))).toBe(
    Date.parse('2025-02-02T00:00:00+05:30') / 1000,
  );
  expect((await fetch(`${origin}/api/yahoo/history?${query}`)).status).toBe(
    404,
  );
});

it('accepts US tickers and requests their exchange-local day window', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ chart: { result: [], error: null } }),
  );
  const origin = await relay(fetcher);
  for (const symbol of ['AAPL', 'BRK-B'])
    expect(
      (
        await fetch(
          `${origin}/api/yahoo/history?symbol=${symbol}&from=2025-01-01&to=2025-02-01`,
        )
      ).status,
    ).toBe(200);
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.pathname).toBe('/v8/finance/chart/AAPL');
  expect(Number(url.searchParams.get('period1'))).toBe(
    Date.parse('2025-01-01T00:00:00-05:00') / 1000,
  );
  for (const symbol of ['aapl', 'BRK.B', 'TOOLONGTICKER', '-ABC'])
    expect(
      (
        await fetch(
          `${origin}/api/yahoo/history?symbol=${symbol}&from=2025-01-01&to=2025-02-01`,
        )
      ).status,
    ).toBe(400);
});

it('blocks foreign origins, non-GET methods, invalid symbols, excessive ranges, and arbitrary destinations before contacting Yahoo', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const origin = await relay(fetcher);
  expect(
    (
      await fetch(`${origin}/api/yahoo/history?${query}`, {
        headers: { Origin: 'https://foreign.example' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${origin}/api/yahoo/history?${query}`, {
        headers: { Host: 'foreign.example', Origin: 'http://foreign.example' },
      })
    ).status,
  ).toBe(403);
  expect(
    (await fetch(`${origin}/api/yahoo/history?${query}`, { method: 'POST' }))
      .status,
  ).toBe(405);
  for (const params of [
    'symbol=https://localhost&from=2025-01-01&to=2025-02-01',
    'symbol=TCS.BO&from=2025-01-01&to=2025-02-01',
    'symbol=TCS.NS&from=1900-01-01&to=2026-01-01',
    `${query}&url=https://other.example/`,
    `${query.replace('2025-01-01', '2025-02-30')}`,
  ])
    expect((await fetch(`${origin}/api/yahoo/history?${params}`)).status).toBe(
      400,
    );
  expect(fetcher).not.toHaveBeenCalled();
});

it('passes quota/access failures honestly and limits repeated local requests', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response('', { status: 429 }),
  );
  const origin = await relay(fetcher);
  for (let i = 0; i < 31; i++)
    expect((await fetch(`${origin}/api/yahoo/history?${query}`)).status).toBe(
      429,
    );
  expect(fetcher).toHaveBeenCalledTimes(30);
  const rejected = await relay(
    vi.fn(async () => new Response('', { status: 403 })) as typeof fetch,
  );
  expect((await fetch(`${rejected}/api/yahoo/history?${query}`)).status).toBe(
    403,
  );
});

it('rejects oversized or invalid upstream JSON', async () => {
  for (const body of ['bad json', ' '.repeat(3 * 1024 * 1024 + 1)]) {
    const origin = await relay(
      vi.fn(async () => new Response(body)) as typeof fetch,
    );
    expect((await fetch(`${origin}/api/yahoo/history?${query}`)).status).toBe(
      502,
    );
  }
});

it('aborts the upstream request when the browser cancels', async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted = false;
  const fetcher = vi.fn<typeof fetch>(async (_input, options) => {
    started();
    return new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener(
        'abort',
        () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  });
  const origin = await relay(fetcher);
  const controller = new AbortController();
  const pending = fetch(`${origin}/api/yahoo/history?${query}`, {
    signal: controller.signal,
  });
  await ready;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect.poll(() => aborted).toBe(true);
});
