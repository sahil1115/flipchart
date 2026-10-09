import { expect, it } from 'vitest';
import { isShellRequest } from './cache-policy';
it('allows only same-origin GET assets without query parameters or authentication', () => {
  const origin = 'https://example.test';
  expect(isShellRequest(new Request(`${origin}/assets/a.js`), origin)).toBe(
    true,
  );
  for (const request of [
    new Request('https://www.alphavantage.co/query?apikey=fixture'),
    new Request(`${origin}/?apikey=fixture`),
    new Request(`${origin}/index.html?utm_source=test`),
    new Request(`${origin}/index.html`, {
      headers: { Authorization: 'fixture' },
    }),
    new Request(`${origin}/index.html`, {
      headers: { 'X-API-Key': 'fixture' },
    }),
    new Request(`${origin}/api`, { method: 'POST' }),
  ])
    expect(isShellRequest(request, origin)).toBe(false);
});
