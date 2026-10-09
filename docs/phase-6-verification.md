# Phase 6 verification

Date: 9 October 2026. Scope: Alpha Vantage, workspace controls/persistence, watchlist and export. Phases 1–5 retained; Phase 7 not started.

## Environment and commands

Windows host, PowerShell, locked dependencies unchanged from Phase 5. Automated Chromium: `C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe`. Browser tests serve the production build from Vite preview at `http://127.0.0.1:4173`.

```powershell

npm run check

$env:FLIPCHART_BROWSER_PATH = 'C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe'

npm run test:e2e

```

Strict typecheck, ESLint, Prettier, **143 unit tests in 20 files** and production build passed. The complete **40-test Chromium suite passed** (36 existing regression flows and 4 Phase 6 flows). Final attribution/quota fixes were also rechecked with the four Phase 6 browser workflows. Main bundle: 547.46 kB minified / 173.60 kB gzip, with the existing non-fatal 500 kB advisory. No extra chart library, backend, worker or dependency added.

## Acceptance evidence

- Both adapters: existing Twelve Data success/error/session fixtures retained; Alpha Vantage adds native daily/weekly/monthly OHLCV, original date labels, null/zero volume, timezone/currency, provider identity, compact/full query separation and raw-only capability checks. Missing/invalid key, quota JSON/HTTP, premium/unsupported endpoint, unsupported listing/interval, invalid range, empty/malformed/mismatched data, credential reflection, cancellation, network/CORS and outage are exercised with fake keys. Connection testing reports unknown quota/plan rather than fabricating usage.

- Disconnect/provider switching: browser flows verify that the chosen key/session/query/chart are cleared, remembered keys stay in distinct provider entries, watchlist remains and reload does not fetch. Existing Twelve Data obsolete-response/cancellation, deduplication, failed refresh and storage-fallback checks remain in the regression suite. No automatic cross-provider or demo fallback.

- Watchlist: selecting the stored native listing creates no history request; explicit Load requests that listing only. Entries are versioned, bounded, validated/projected and namespaced by provider. Credential fields are discarded. No batch watchlist fetch.

- Layout/parameters: browser keyboard apply/collapse/visibility actions, expanded cards and reload retention; reset restores defaults and retains data. Unit checks cover schema projection, visibility-only migration, invalid/unknown versions, invalid periods/layout, denied storage and separate provider keys. Existing v1 chart-view settings remain compatible.

- Export: CSV round-trip matches every active OHLCV row and all 24 named-series columns, active parameters, empty warm-up and full precision; visible output matches a slice of full-history calculations for daily/local weekly/monthly, with provisional flags and nulls intact. Text formula escaping and quoted commas/quotes are tested without converting numeric negatives to text. Browser downloads verify full/visible rows, provider/currency/adjustment, native monthly data, companion JSON and absence of fixture credentials. Actual chart panning changes the visible export and still matches the corresponding full-history rows.

- Chart ownership: a single native chart owns the shared time scale and crosshair for all visible panes; no reciprocal synchronization callbacks. StrictMode remounts pair each cursor/range subscription with the same cleanup callback. Existing parameter/visibility/theme preservation tests verify no chart replacement/view reset, repeated range jumps or leaked series/listeners. Card collapse/expansion only changes details, not chart data or calculations.

- Partial availability: Alpha Vantage 100-bar compact response shows unavailable SMA-200 alongside usable RSI/MACD/ATR; native current week/month is provisional. Existing short-history/unknown-volume/import cases remain usable.

## Provider status and boundaries

**Twelve Data: fixture-tested; live verification pending. Alpha Vantage: fixture-tested; live verification pending.** No real user key supplied. Official Alpha Vantage docs/support/terms were reviewed; public IBM demo daily/weekly/monthly response headers returned HTTP 200 and `Access-Control-Allow-Origin: *`. This is not user-entitlement, production-origin browser or real-key verification. See [provider evidence](providers.md).

Native weekly/monthly preserve provider last-trading-day timestamps and cannot be turned into daily candles. Raw-only Alpha Vantage intentionally excludes adjusted-close feeds; full daily history may be rejected without premium. Conservative current-period and local aggregation calendars can reduce finalized history. Search regions are not exchange IDs; exchange/MIC remain unavailable. Provider exports require the user's permitted data use, and no durable provider cache is introduced. CSV import is still daily-only. PWA/offline shell, cross-engine/actual macOS checks and broad performance profiling remain Phase 7.

Responsive layout captures at 375/768/1440 were recorded under the ignored Playwright output directory; mobile and desktop captures were visually inspected. No page-wide horizontal overflow; collapsed details and expanded cards remain usable. The existing 5,000-candle import/calculation/parameter/pan/reload regression passed; observed workflow times in the full run were 1,324 ms upload-to-loaded and 305 ms parameter-apply-to-visible. These are single-host workflow observations, not Phase 7 release profiling or universal benchmarks.

An initial pan test failed because the tall chart was centered with its upper pane outside the viewport. Scrolling its top into view corrected the gesture; the targeted check and complete 40-test rerun passed. No acceptance failure remains in fixture verification.

Main changed areas: `src/providers/alpha-vantage.ts`, shared provider request/session contracts and per-provider credential storage; `src/app/App.tsx` and `ProviderPanel.tsx` for switching/watchlist; `src/state/dashboard.ts`, `src/storage/watchlist.ts`, dashboard cards/controls and styles for validated persistence/layout; `src/import-export/export.ts` and `PriceChart.tsx` for export/window ownership. New unit/provider/browser fixtures and README/provider/data/progress documentation accompany the changes. No Phase 7 implementation or external publication.
