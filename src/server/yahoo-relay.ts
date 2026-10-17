import type { Connect, Plugin } from 'vite';
import { isTradingDate } from '../data/normalize';

const maxBytes = 3 * 1024 * 1024;
/** NSE symbols end in .NS; US tickers are bare (Yahoo uses '-' for class shares, e.g. BRK-B). */
export const relaySymbolPattern =
  /^(?:[A-Z0-9][A-Z0-9&_-]{0,39}\.NS|[A-Z][A-Z0-9-]{0,9})$/;
/** Company names or tickers: letters, digits, spaces and a few name punctuation marks. */
export const relayQueryPattern = /^[\p{L}\p{N}][\p{L}\p{N} .&'-]{0,39}$/u;
const requestsPerMinute = 30;

/** A loopback-only, same-origin route to one fixed public data endpoint. */
export function createYahooRelay(
  base = '/',
  fetcher: typeof fetch = fetch,
): Connect.NextHandleFunction {
  const prefix = `${base.replace(/\/$/, '')}/api/yahoo`;
  let active = 0;
  let recent: number[] = [];
  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route =
      url.pathname === `${prefix}/history`
        ? 'history'
        : url.pathname === `${prefix}/search`
          ? 'search'
          : null;
    if (!route) return next();
    const reply = (status: number, category: string, message: string) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify({ error: { category, message } }));
    };
    const peer = req.socket.remoteAddress;
    let hostname = '';
    try {
      hostname = new URL(`http://${req.headers.host ?? 'invalid'}`).hostname;
    } catch {
      // Invalid Host headers are rejected by the loopback hostname check below.
    }
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '') ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(hostname) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`)
    )
      return reply(
        403,
        'unsupported-endpoint',
        'Yahoo relay is local and same-origin only.',
      );
    if (req.method !== 'GET')
      return reply(
        405,
        'unsupported-endpoint',
        'Only GET requests are supported.',
      );
    let upstream: URL;
    let notFound: string;
    if (route === 'search') {
      const text = (url.searchParams.get('q') ?? '').trim();
      if (
        !relayQueryPattern.test(text) ||
        [...url.searchParams.keys()].some((key) => key !== 'q')
      )
        return reply(
          400,
          'unsupported-listing',
          'Search with a company name or ticker of at most 40 letters, digits and spaces.',
        );
      upstream = new URL('https://query1.finance.yahoo.com/v1/finance/search');
      upstream.searchParams.set('q', text);
      upstream.searchParams.set('quotesCount', '20');
      upstream.searchParams.set('newsCount', '0');
      upstream.searchParams.set('listsCount', '0');
      notFound = 'Yahoo did not find matching stocks.';
    } else {
      const symbol = url.searchParams.get('symbol') ?? '';
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (
        !relaySymbolPattern.test(symbol) ||
        !isTradingDate(from) ||
        !isTradingDate(to) ||
        from > to ||
        Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >
          30 * 366 * 86400_000 ||
        [...url.searchParams.keys()].some(
          (key) => !['symbol', 'from', 'to'].includes(key),
        )
      )
        return reply(
          400,
          'unsupported-listing',
          'Use an NSE symbol ending in .NS or a US ticker, and an ordered date range of at most 30 years.',
        );
      upstream = new URL(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      );
      upstream.searchParams.set('interval', '1d');
      // Exchange-local midnight: IST for NSE, US Eastern standard time for US
      // listings (sessions open at 09:30, so the DST hour never moves a bar).
      const offset = symbol.endsWith('.NS') ? '+05:30' : '-05:00';
      upstream.searchParams.set(
        'period1',
        String(Date.parse(`${from}T00:00:00${offset}`) / 1000),
      );
      upstream.searchParams.set(
        'period2',
        String(Date.parse(`${to}T00:00:00${offset}`) / 1000 + 86400),
      );
      notFound = 'Yahoo did not find history for this symbol.';
    }
    recent = recent.filter((time) => Date.now() - time < 60_000);
    if (active >= 2 || recent.length >= requestsPerMinute)
      return reply(
        429,
        'quota-exhausted',
        `Local Yahoo requests are limited to ${requestsPerMinute} per minute and two at a time. Wait before trying again.`,
      );
    active++;
    recent.push(Date.now());
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', cancel);
    void (async () => {
      try {
        const response = await fetcher(upstream, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20_000),
          ]),
          redirect: 'error',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          if (response.status === 429)
            return reply(
              429,
              'quota-exhausted',
              'Yahoo is limiting requests. Try again manually later.',
            );
          if (response.status === 401 || response.status === 403)
            return reply(
              403,
              'unsupported-endpoint',
              'Yahoo rejected this request. Its unofficial endpoint may be unavailable; try a CSV import.',
            );
          if (response.status === 404)
            return reply(404, 'unsupported-listing', notFound);
          return reply(
            502,
            'provider-outage',
            'Yahoo is temporarily unavailable.',
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing response');
        let bytes = 0;
        const parts: Uint8Array[] = [];
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw new Error('Oversized response');
          }
          parts.push(chunk.value);
        }
        const data: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (res.destroyed) return;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(JSON.stringify(data));
      } catch {
        if (!res.destroyed)
          reply(
            502,
            'provider-outage',
            'Could not retrieve Yahoo data. Check your internet connection and try again manually.',
          );
      } finally {
        active--;
        res.off('close', cancel);
      }
    })();
  };
}

export function yahooRelayPlugin(): Plugin {
  return {
    name: 'yahoo-local-relay',
    configureServer(server) {
      server.middlewares.use(createYahooRelay(server.config.base));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createYahooRelay(server.config.base));
    },
  };
}
