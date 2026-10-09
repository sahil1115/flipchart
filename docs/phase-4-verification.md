# Phase 4 verification

Date: 9 October 2026. Status: **fixture-tested; live verification pending**. No real user key was available or used. Phases 5–7 were not started.

## Implemented behavior and files

- `src/providers/twelve-data.ts`: native search/usage/history adapter, safe typed errors, strict OHLC/metadata normalization and header-only credential transport.
- `src/providers/live-session.ts`: isolated query client, complete non-secret cache identity, explicit requests, cancellation and session retention limits.
- `src/storage/provider-credential.ts`: separate opt-in credential storage with denial/deletion feedback.
- `src/features/settings/ProviderPanel.tsx`: masked key, Remember/Test/Disconnect, debounced exchange selection, daily window/adjustment, Load/Refresh/Cancel and accessible statuses/search shortcut.
- `src/app/App.tsx`, `src/features/dashboard/DatasetWorkspace.tsx`, `src/styles.css`: provider mode, retained stale data, timestamps/coverage/attribution, control scopes and responsive connection panel.
- Three new unit test files, `tests/fixtures/twelve-data.ts`, `tests/e2e/provider.spec.ts` and the provider entry regression in `tests/e2e/demo.spec.ts`.
- `docs/providers.md`, this evidence, `docs/implementation-progress.md` and README: verified sources, boundaries, controls and run instructions.

No new dependency was needed. Fixtures are explicitly fake credentials and fictional stocks on two exchanges; all browser provider traffic is intercepted. The adapter never calls provider indicator endpoints.

## Checks actually run

```powershell
npm run check
$env:FLIPCHART_BROWSER_PATH = 'C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe'
npm run test:e2e
```

Final quality gate: strict typecheck, ESLint, Prettier, **110 unit tests in 15 files** and static production build passed. **32 Chromium browser tests** passed against the production preview: 20 earlier-phase regressions plus 12 Phase 4 flows. Windows host, automated Chromium executable above; no Firefox/WebKit or actual macOS/Safari claim is made. Build emits a non-fatal advisory for the approximately 520 kB minified application chunk (about 165 kB gzip). No measured release-performance regression is claimed; Phase 7 profiling remains pending.

The first browser run exposed an illegal native-fetch binding hidden by mocks; the default fetch wrapper was corrected and the complete browser suite passed afterward. A failed-entry cache test initially reused an already-consumed Response; its fixture now supplies a new Response per request and all unit tests pass.

| Acceptance item                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success and failure categories     | Adapter tests exercise HTTP and HTTP-200 error objects for invalid key, quota, unsupported listing/interval/endpoint, insufficient history and outage; missing key before traffic, empty/malformed responses, invalid OHLC/metadata, reflected secrets, network/CORS and cancellation. Browser flows include success, invalid key, unknown listing, outage, network and quota refresh.                                                                                                                                                                               |
| Native listing/time/conventions    | Two identical symbols on XNAS/XLON retain separate identities, requests, USD/GBP and exchange timezone. Exchange dates remain strings; raw requests use `none`, adjusted use `all` for full OHLC. Same-day bars are provisional; unknown/zero volume stays null/zero.                                                                                                                                                                                                                                                                                                |
| Adequate history and honest limits | Request tests verify prior warm-up allowance; UI exposes actual 240-bar fixture coverage instead of promising the requested year count. Short data uses existing independent indicator unavailable states. Daily-only and documented 5,000 endpoint cap are visible.                                                                                                                                                                                                                                                                                                 |
| No configuration requests          | At 375/768/1440 px, range/chart-view, parameter, visibility and reduced-effects changes make zero requests. Window/adjustment edits stay local until Load; the explicit changed load issues a new request. Matching Load reuses cache.                                                                                                                                                                                                                                                                                                                               |
| Correct reuse/cancellation         | Unit tests cover in-flight deduplication, range/listing/adjustment/credential-session/plan/date identity, manual refresh and exchange-date separation without a timer. Even abort-ignoring old responses cannot apply. Browser slow-history cancellation followed by demo preserves demo; selection of London loads London. Search debounce and slash focus are verified.                                                                                                                                                                                            |
| Refresh failure                    | Quota refresh retains original chart/data/fetch time, marks stale and never substitutes demo. Explicit successful refresh clears stale. No automatic retry, mount/focus/reconnect refetch or fabricated countdown.                                                                                                                                                                                                                                                                                                                                                   |
| Credentials/storage                | Masked Show/Hide, memory default, explicit Remember, reload with zero requests, separate saved-key schema, deletion/disconnect and denial fallback tested. Cache/preference controls retain credentials as disclosed. Dataset IndexedDB and UI preferences contain no fixture credential or live dataset; query-key tests exclude credential. Safe errors omit reflected provider key/URL text. Screenshots captured only with fake key masked. Export does not exist until Phase 6; credentials are absent from the dataset contract. No service worker exists yet. |
| Retention                          | Cache tests retain at most five success/failure entries, and Disconnect clears all. Memory retention is also bounded by 25,000 bars/estimated 20 MiB; no authenticated dataset persistence. Disconnect preserves demo/import library.                                                                                                                                                                                                                                                                                                                                |
| Responsive usability               | Provider load, chart, error/control flows pass at 375/768/1440 with no horizontal overflow or page exceptions. Masked screenshots recorded under ignored `verification/screenshots/provider-*.png`; mobile and desktop captures visually inspected.                                                                                                                                                                                                                                                                                                                  |

## External verification and limitations

Official sources, checked endpoint contracts, credit annotations, terms choices and read-only public CORS probes are recorded in [providers.md](providers.md). Search GET returned 200 and history Authorization preflight returned 204 with wildcard origin/header permission. These public responses do **not** establish authenticated time-series access. Provider request acceptance tests use intercepted browser fixtures, never live history.

Live authenticated history, user-specific entitlement/adjustment/market access, production-origin CORS, delays and history truncation are pending. No invented quota/reset promises or universal rights are made. Provider session data is not a durable offline cache. Calendar warm-up approximates observed sessions; it is not a verified trading calendar or convergence guarantee. Date-boundary stale evaluation happens on render without a background fetch. Alpha Vantage, weekly/monthly UI, remaining indicators, export and PWA remain scheduled later work.

## Run and review

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Demo/CSV work without a key. For your own provider account, choose **Data connection → Use key → optional Test Connection → search → exchange match → Load history**. Review coverage and account limits. Remember is optional. Refresh requests the loaded dataset; Disconnect clears provider session/key state. Stop here for Phase 4 review.
