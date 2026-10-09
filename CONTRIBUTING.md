# Contributing

Use a supported Node LTS release (22.12+), run `npm ci`, then `npm run dev`.
Before submitting changes run `npm run check` and production browser checks:

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
```

Keep calculation modules pure, dated null outputs aligned, formulas documented and independent reference fixtures auditable. Do not fabricate sessions, volume, exchange facts, provider access or indicator values. Preserve explicit demo/import/live identities, manual provider fetches, consistent OHLC adjustments and safe credential storage. Use fictional listings and fake credentials in tests; never commit a real API key or authenticated response envelope.

Use semantic theme tokens and the shared chart library. Test changed workflows at narrow/desktop widths and with keyboard controls. Provider, deployment and browser claims need dated official sources and evidence. Report unavailable real-key/device checks rather than claiming them. Run `npm run notices` after dependency changes and include the updated lockfile and notices. Keep the service worker's exact app-asset allowlist; never add provider runtime caching or a key proxy.

Describe the behavior changed, its reason, validation and remaining limitations in pull requests. Do not publish externally as part of a routine contribution without maintainer authorization.

For each release, update the version in `package.json`, `package-lock.json`, and the README, create a matching `vX.Y.Z` Git tag, and publish a GitHub release describing the changes. Keep version updates in GitHub release notes.
