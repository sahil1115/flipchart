import type { Plugin } from 'vite';

/**
 * lightweight-charts injects one inline <style> for the TradingView attribution
 * logo, which its licence requires. Allow exactly that text by hash instead of
 * 'unsafe-inline'. csp.test.ts re-derives this from the installed library, so a
 * version bump that changes the text fails the test rather than the logo.
 */
export const attributionStyleHash =
  "'sha256-3pRED1tOXas1FXFoPb9TGCjmYe9XQsmO9OV23khV2nY='";

/**
 * Production Content Security Policy. Scripts and styles are same-origin only
 * (no inline script, eval or inline style), and network calls are limited to
 * this origin plus the two browser-direct provider APIs. Yahoo goes through the
 * same-origin local relay. frame-ancestors and report-uri are ignored in a
 * <meta> policy, so those need a response header on the host.
 */
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  `style-src 'self' ${attributionStyleHash}`,
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.twelvedata.com https://www.alphavantage.co",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Build-only: the dev server needs inline scripts and a websocket for HMR. */
export function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'flipchart-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: contentSecurityPolicy,
          },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}
