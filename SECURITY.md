# Security reporting

Do not put API keys, personal CSV files, authenticated URLs or response envelopes in public reports. If a key was exposed, revoke it through its provider first.

For an ordinary bug, open a repository issue with a minimal synthetic reproduction. For a vulnerability, use the repository's private security advisory/reporting channel if enabled. If private reporting is unavailable, ask the repository maintainer for a private channel without posting exploit details or credentials. No unverified contact address is advertised here.

Include the affected version/commit, browser, expected boundary and a synthetic reproduction. This browser application has no account system or server credential vault. Optional remembered keys are browser storage and can be read by scripts running on the same origin. Host on an origin you trust, use HTTPS and avoid sharing provider accounts/keys. Market-data requests bypass service-worker caches; clearing dataset caches does not remove remembered keys. Use Disconnect to delete the selected provider's key.

Production builds ship a Content Security Policy (a `<meta>` tag added at build time, see `src/server/csp.ts`). Scripts and styles are same-origin only, with no inline script, `eval` or `unsafe-inline`; the one inline style that lightweight-charts injects for the TradingView logo is allowed by its hash. Network requests are limited to this origin, Twelve Data and Alpha Vantage, so injected script cannot send a remembered key to another host. A `<meta>` policy cannot set `frame-ancestors`, so if you host the app, also send `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) as a response header. The dev server (`npm run dev`) does not apply the policy.

The maintainers have not committed to a response-time SLA. Real provider entitlements and data redistribution rights remain outside the application license.
