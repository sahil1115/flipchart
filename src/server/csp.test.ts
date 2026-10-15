import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { attributionStyleHash, contentSecurityPolicy } from './csp';

it('hashes exactly the inline style lightweight-charts injects for its attribution logo', () => {
  const bundle = readFileSync(
    'node_modules/lightweight-charts/dist/lightweight-charts.production.mjs',
    'utf8',
  );
  const style = /innerText="(a#tv-attr-logo[^"]*)"/.exec(bundle)?.[1];
  expect(style, 'attribution style not found; update csp.ts').toBeDefined();
  const hash = `'sha256-${createHash('sha256').update(style!).digest('base64')}'`;
  expect(
    attributionStyleHash,
    'lightweight-charts changed; update csp.ts',
  ).toBe(hash);
});

it('is strict: same-origin scripts, no unsafe directives, wildcards or plain http', () => {
  const directives = Object.fromEntries(
    contentSecurityPolicy.split('; ').map((part) => {
      const [name, ...values] = part.split(' ');
      return [name, values];
    }),
  );
  expect(directives['script-src']).toEqual(["'self'"]);
  expect(directives['object-src']).toEqual(["'none'"]);
  expect(directives['connect-src']).toEqual([
    "'self'",
    'https://api.twelvedata.com',
    'https://www.alphavantage.co',
  ]);
  expect(contentSecurityPolicy).not.toMatch(/unsafe-|\*|http:/);
});
