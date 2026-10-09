# Phase 2 verification

Verification date: 9 October 2026. Scope: Phase 2 only, preserving Phase 1. Final acceptance checks passed; work is stopped for review before Phase 3.

## Implemented behavior

- Daily CSV upload, downloadable template, first-five-record preview, explicit delimiter/column mapping, date/number formats, symbol/name/exchange/currency/timezone/adjustment controls and trailing incomplete-candle declaration.
- Whole-file validation with logical source record numbers; chronological sorting; exact duplicate coalescing; conflicting duplicate/material OHLC/date/numeric errors reject loading. Quotes/escaped quotes/multiline fields are parsed properly. Missing volume is preserved as unknown and not zero.
- Typed provider interface for listing search, capabilities, normalized history, access uncertainty, cancellation and error categories. No provider adapter or live credentials are introduced.
- Runtime listing/dataset metadata validation, mode namespaces, coverage/date consistency and projection of documented non-secret fields before storage. Imported data stays distinct from synthetic demo data in header, summary, library, chart labels and footer.
- Native IndexedDB atomic dataset-library/selection persistence with bounded retention, recent datasets/listings, individual deletion, cache clearing and separate preference reset. Denial/quota failure retains usable session data with honest durability warnings. Invalid/unsupported records are not blindly restored. Appearance preferences from Phase 1 remain valid; chart view/range use their own validated versioned schema.
- Pure weekly/monthly aggregation helpers with auditable OHLCV fixtures, unknown-volume propagation, source coverage, group provenance and conservative partial coverage flags. Chart/import interval controls remain daily-only until Phase 5.
- Dashboard extraction into reusable landing/dataset workspace components; charts use declared currency/timezone and import attribution, omit an entirely unavailable volume pane, and visibly mark provisional latest values.

## Acceptance evidence

| Check                                                  | Result                                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict typecheck, lint, format check, production build | Passed in final `npm run check`                                                                                                                                                                                                                            |
| Unit tests                                             | 70 tests in 10 files passed with the retained two-worker thread pool                                                                                                                                                                                       |
| Production browser tests                               | All 15 tests passed: five Phase 1 regression flows and ten Phase 2 import flows                                                                                                                                                                            |
| CSV without a key                                      | Browser import and chart load passed with no external requests observed at 375/768/1440 widths                                                                                                                                                             |
| At least 5,000 valid candles                           | Pure import test and browser import/chart/reload test passed with 5,000 unsorted input rows                                                                                                                                                                |
| Normalization/import feedback                          | Tests cover quoted fields, mapping, invalid OHLC, non-finite/negative values, ambiguous/invalid dates, timezone conversion, missing metadata, exact/conflicting duplicates, gaps, optional volume, bounds and incomplete trailing bars                     |
| Honest missing volume                                  | Missing inputs remain `null`; known zero remains valid; partially missing volume displays whitespace, and entirely unknown volume produces an unavailable message without a volume pane                                                                    |
| Dataset/preferences reload                             | Real browser reload restores the selected imported dataset, chart view/range and reduced-effects setting; source import time is preserved separately from data date                                                                                        |
| Storage fallback                                       | Fake IndexedDB exercises actual transactions; unit/browser failure injection tests denied access, quota failures, usable memory mode and warning that failed durable changes may reappear after reload                                                     |
| Control scopes                                         | Browser checks individual deletion, active-chart clearing, deleting another dataset while preserving the active chart, cache removal, and preference reset retaining datasets                                                                              |
| Cache retention                                        | Unit checks eviction at ten datasets and at 100,000 total candles; a 20 MiB normalized-payload limit is enforced in the same retention path                                                                                                                |
| Slow restore ordering                                  | UI unit test verifies a pending startup restore cannot replace a newer user-selected demo                                                                                                                                                                  |
| Aggregation                                            | Independent hand-authored expected values cover a full week, partial trailing week/month, leap-year month, gaps, unknown/zero volume, source conventions and empty input                                                                                   |
| Phase 1 regression                                     | Five existing production browser flows passed, including remount cleanup, 375/768/1440 widths, keyboard, reduced effects and opaque fallback                                                                                                               |
| Visual QA                                              | Imported preview and loaded-chart screenshots inspected at mobile and desktop widths; narrower convention controls were expanded to a single column for clarity. Final mobile captures were inspected after the expanded run; tablet captures are recorded |

The initial exact-label browser locator timed out for select controls; explicit accessible labels were added and the eight import tests passed afterward. A default-worker unit run stalled, and a later fork run reported worker startup timeouts for two React files (not passed assertions). A subsequent two-worker standard check passed all 70 tests. The retained configuration bounds workers at two and uses Vitest's supported thread pool to avoid Windows fork-startup overhead. The final check with the retained thread pool passed all 70 unit tests, and the final production browser suite passed all 15 tests. Failed or interrupted attempts are not counted as passes.

## Environment, commands and versions

Windows host; Node 22.18.0; npm 11.6.4; Playwright 1.64.0; available Chromium 143.0.7499.4 at the bundled revision-1200 executable. Browser runs use broader process permissions so Playwright can start and terminate its own preview server; failure injection is deliberate fixture behavior. This is automated Chromium verification on Windows, not macOS, Safari/Firefox/WebKit or manual device certification.

```sh
npm run check
```

```powershell
$env:FLIPCHART_BROWSER_PATH = 'C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe'
npm run test:e2e
```

Browser tests use the built static output served by the Playwright Vite preview. New dependencies: Papa Parse 5.7.0 (runtime), @types/papaparse 5.5.2 and fake-indexeddb 6.2.5 (developer tools). Exact and transitive versions are retained in the npm lockfile; install reported zero audit vulnerabilities. Other stack versions are retained from Phase 1.

Sources checked 9 October 2026: [Papa Parse docs](https://www.papaparse.com/docs), [MDN IndexedDB usage](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [Vitest worker pools](https://vitest.dev/config/pool). These guide parser/transaction/test-harness behavior; they are not claims of live market-data verification.

## Boundaries and changed files

Inputs are daily bars only: UTF-8, 10 MiB maximum, 50,000 rows/candles, explicit formats, no thousands separators/scientific notation, no offset-free local timestamps or intraday data. Symbol/currency/timezone are required; name/exchange can be unavailable. Adjustment convention is user-declared, and no OHLC column is modified to synthesize an adjustment. The form treats daily candles finalized unless the last chronological candle is explicitly marked incomplete.

Retain original CSV files as backups. The browser library is limited to 10 datasets, 100,000 candles and 20 MiB of serialized normalized dataset payload, with oldest eviction. Storage failure means session use and cannot promise permanent saves/deletions. Provider-cache persistence is intentionally disabled until verified terms/adapters exist. PWA/offline reopening, live providers, indicators and interval UI remain later-phase work. No real-key, 5,000-candle performance benchmark, deployment or cross-platform release claim is made.

Changed/new files: `src/import-export/` parser, form and tests; `src/data/` types, normalization, metadata validation and aggregation/tests; `src/providers/types.ts`; `src/storage/` dataset store and chart preferences/tests; `src/state/workspace.ts`; `src/features/dashboard/` landing and workspace; `src/app/App.tsx` and tests; `src/charts/PriceChart.tsx`; responsive stylesheet; npm manifest/lockfile; Vitest worker config; existing demo browser tests and new import browser tests; auditable fixture; README; data contract, progress and verification docs. The original plan is unchanged. Screenshots/traces are generated under ignored artifact paths.

No unresolved Phase 2 acceptance failures remain. Stopped at Phase 2 for review. Phase 3 remains not started.
