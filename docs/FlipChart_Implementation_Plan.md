# FlipChart — Browser-First Implementation Plan

Version: 1.1 | Prepared: 9 October 2026 | Delivery: seven implementation phases

## 1. Product goal and decisions

Build an open-source stock-market dashboard that ordinary users can open in a browser on Windows or macOS. It displays price, volume, and mathematically calculated technical indicators. It does not generate investment opinions, buy/sell labels, predictions, trading signals, stock ratings, or AI commentary.

The first visual theme is **Glass Light**: frosted panels, a restrained pale blue/lilac background, subtle borders, and highly readable charts. Establish a theme system immediately so additional themes can be added later without rewriting components or calculations.

### Distribution decision

- **First release: a static React web application.** A user visits its HTTPS URL and starts with demo data, a CSV import, or their own supported market-data key.
- Add progressive web app (PWA) support in Phase 7. Installation is optional and available only where the browser supports it; ordinary browser use always remains available.
- End users of a hosted build need no Python, Node.js, Docker, database, command line, or account with FlipChart. A live data provider may require its own account/key.
- Contributors use Node.js LTS and npm to develop/build the project. Self-hosters build once and serve the resulting static files.
- Opening the compiled HTML through `file://` is not a supported installation method. Serve the application over HTTPS, or use a local development/preview server.
- Do not introduce Electron, Tauri, Next.js, Express, a hosted application backend, or authentication into these seven phases. A desktop wrapper can be a separate later project if users need one.
- Hosting infrastructure serves the application assets. Live data requests go from the user's browser to the selected provider; FlipChart does not operate a credential proxy.

### Scope of v1

Stocks and ETFs supported by the selected provider or imported file; daily candles first, then documented weekly/monthly views. Use exchange-aware listings, currencies, and timestamps. Do not promise every exchange, unlimited history, real-time prices, or free access to all data.

The three entry modes are:

1. **Demo:** explicitly labeled, bundled synthetic OHLCV data; no key needed.
2. **Import CSV:** user-owned OHLCV data; calculations run locally.
3. **Live provider:** Twelve Data first, Alpha Vantage second; the user supplies their own key.

Cached and imported datasets remain useful offline. An uncached live request requires internet access.

## 2. Best items selected from each proposal

The documents are build specifications, not verified implementations. Retain the strengths below while applying the corrections in this plan.

| Proposal | Best items to retain | Where they appear | Corrections or exclusions |
|---|---|---|---|
| GPT (`llm_gpt.txt`) | Provider/plan capability checks; exchange-aware search; timezones; warm-up history; consistent price adjustments; reference fixtures; honest insufficient-data states; explicit stale data; distinct demo mode; no fabricated quota counts | Data model, calculation contract, Phases 2–6 | Replace the unspecified backend with direct browser adapters. Reduce the default visible chart count. |
| Claude (dashboard prompt) | Clear React/TypeScript/Vite stack; one chart library; Zustand and TanStack Query; pure indicator module; Wilder RSI; parameter controls; CSV export; documented reference tests; incremental build order | Stack, Phases 1–7 | Fix cache keys, adjusted-close consistency, warm-up fetching, and volatility conventions. Exclude automatic credential persistence and unreachable VWAP. |
| DeepSeek | Modular provider interface; typed errors; reusable IndicatorCard; pure calculation functions; null warm-up values; strict TypeScript; accessible controls; keyboard shortcut for search; phased implementation | Architecture, testing, Phases 2–6 | Do not use Next.js/proxy architecture. Multi-output indicators need named series rather than a single numeric array. |
| Kimi | React/Vite direction; provider abstraction; toggleable panels; per-indicator parameters; user-controlled data connection; intraday-only VWAP; clear visualization-only purpose | Phases 3–6 and future backlog | Do not describe localStorage as secure credential storage. Yahoo is outside the direct-browser release. |
| Original stock-market prompt | One shared OHLCV dataset for calculations; manual refresh; quota-friendly caching; recent tickers; concise stock summary; skeletons; data attribution; sequential construction | Phases 1, 4, and 6 | One dataset does not mean exactly one network request. Verify endpoints and history access; do not assume adjusted daily data is free. |
| GLM | Daily returns; documented historical volatility; distance from SMA-200; informative formula tooltips; collapsible panels; independent unavailable states | Phase 5, summary metrics, Phase 6 | Volume profile and peer correlation require additional data and are deferred. Do not invent retry countdowns. |
| Qwen | Fully integrate one provider before expanding; simple Load workflow; normalized data; useful loading/empty/error states; runnable deliverables; sample mode; separation of prototype and production concerns | Phases 1, 2, 4, and 7 | Select one stack. Avoid duplicate price panels and arbitrary minimum chart counts when data is insufficient. |
| Gemini | Main price workspace plus grouped indicators; expandable panels; visibility controls; provider status; graceful failure messages; reusable chart components | Phases 1, 3, and 6 | Use the requested glass theme rather than a neon terminal. No free Finnhub-history assumption, automatic demo substitution, or ambiguous stock-market “24h change.” |

### Combined decisions

- Claude supplies the project structure and phased workflow.
- GPT supplies the calculation and data-integrity rules.
- DeepSeek supplies the separation of providers, calculations, and presentation.
- Kimi and Gemini supply useful workspace controls, adapted to a glass appearance.
- The original prompt supplies request-efficiency and restrained scope.
- GLM supplies useful additional numerical views with explicit conventions.
- Qwen supplies the one-provider-first approach and easy onboarding.
- CSV import, a reusable theme system, and browser-first distribution complete the user's usability requirements.

## 3. Technology stack

Use maintained, mutually compatible stable releases at implementation time. Record actual versions and commit a lockfile; do not copy outdated version pins from the source prompts.

| Concern | Choice | Responsibility |
|---|---|---|
| UI | React + TypeScript, strict mode | Components, forms, interaction |
| Build | Vite | Development server and static production output |
| Styling | Tailwind CSS + CSS custom properties | Layout and reusable theme tokens |
| Financial charts | TradingView Lightweight Charts | Candles, lines, histograms, and panes |
| UI state | Zustand | Listing, display range, interval, layout, parameters; exclude persistent credentials |
| Server-data state | TanStack Query | Request coordination, memory caching, cancellation; explicit manual-fetch policy |
| Calculations | Pure TypeScript modules | Deterministic, testable indicators independent of React/providers |
| CSV | Papa Parse, if needed | Proper quoted-field parsing and robust CSV export |
| Preferences | localStorage with versioned schemas | Theme ID, visible panels, parameters, recent listings/watchlist |
| Dataset persistence | IndexedDB; a small wrapper such as idb-keyval if useful | Imported/demo datasets and permitted provider caches |
| Credentials | Memory by default | Optional explicit browser persistence; no promise of a secure browser vault |
| Unit tests | Vitest | Reference calculations, normalization, aggregation, imports, exports, caching |
| Browser verification | Playwright | Meaningful end-to-end flows and production-build checks |
| PWA | vite-plugin-pwa/Workbox | Application-shell offline support and optional installation |
| Quality | ESLint + Prettier + TypeScript | Consistent code and checked types |
| CI | GitHub Actions | Checks on pull requests and build verification |
| Application license | MIT | Simple permissive open-source distribution; preserve dependency notices |

Do not add another charting library unless a required view cannot reasonably be implemented with Lightweight Charts. Document any necessary addition and why. Use the existing dependency set when possible; do not ask for approval for routine implementation choices within this specification.

## 4. Architecture and contracts

### Suggested folders

| Path | Purpose |
|---|---|
| `src/app/` | App shell, startup, error boundary |
| `src/components/` | Reusable accessible controls and glass panels |
| `src/features/dashboard/` | Workspace, stock summary, chart visibility |
| `src/features/settings/` | Connection settings and preferences |
| `src/charts/` | Chart wrappers, panes, theme application, synchronization |
| `src/data/` | Types, validation, normalization, dataset identity |
| `src/providers/` | Interface, capabilities, Twelve Data/Alpha Vantage adapters |
| `src/indicators/` | Pure calculation modules and output types |
| `src/storage/` | Preferences, version migrations, dataset cache |
| `src/import-export/` | CSV parsing, mapping, validation, export |
| `src/themes/` | Theme definitions, semantic tokens, chart palettes |
| `src/state/` | Zustand stores and query-key factories |
| `src/demo/` | Deterministic synthetic dataset and metadata |
| `src/workers/` | Optional computation worker, only if profiling justifies it |
| `tests/fixtures/` | Small auditable fixtures and expected values |
| `tests/e2e/` | Browser workflows |
| `docs/` | Architecture, calculations, providers, themes, verification evidence |
| `public/` | Application icons and static assets |

Adapt this structure to repository conventions if implementing in an existing repository; do not reorganize unrelated code.

### Dataset contract

Normalized candles must contain an unambiguous time value and finite numeric OHLC prices. Volume may be `null` when unavailable; missing volume must not be invented as zero.

Store dataset metadata separately from candles:

- Provider/source and source mode: `demo`, `import`, or `live`.
- Provider listing identity, ticker, company name when available, exchange/MIC when available, currency, exchange timezone.
- Actual interval, adjustment mode, requested range, actual available coverage, and whether a candle is incomplete.
- Retrieval time, latest candle time, delayed/EOD status when known, and stale status.
- Dataset ID/revision and the conventions used for locally aggregated bars.

For end-of-day bars, preserve the exchange trading date as a date rather than changing it through a browser timezone conversion. For any future intraday bars, preserve an absolute timestamp and exchange timezone.

Sort chronologically. Reject invalid OHLC relationships, non-finite prices, negative known volume, and malformed timestamps. Deduplicate deterministically; reject conflicting duplicates or require an explicit documented policy. Never fill missing sessions, fabricate prices, or silently repair material errors.

### Provider interface

Separate listing search results from time-series results. Search returns listing matches, not `Candle[]`.

The interface must expose:

- `searchSymbol(query, credential, abortSignal)` -> listing matches containing symbol, exchange, currency/timezone when supplied.
- `getCapabilities(listing, accessProfile)` -> supported intervals, known history limits, adjustment modes, and known unavailable features. Access information can be unknown; do not invent plan detection.
- `getOHLCV(request, credential, abortSignal)` -> normalized candles **and** metadata.
- Typed error categories: missing/invalid key, quota exhaustion, unsupported listing/interval/endpoint, insufficient history, empty response, network/CORS failure, provider outage, malformed response.

Adapters translate interval names and listing identifiers into each provider's format. Yahoo-style suffixes such as `.NS` or `.BO` must not be passed blindly to other providers.

### Fetching and cache rules

1. One normalized dataset feeds all indicators. Never request provider indicator endpoints.
2. Fetch enough prior history for enabled indicators when access allows. Necessary pagination is permitted and must count toward the provider quota.
3. Symbol search and connection tests are additional requests. Do not claim all user actions cost one request.
4. Use a query key containing provider, non-secret session/access identity, listing/exchange, actual interval, requested history boundaries/range, and adjustment mode. Never put an API key in a query key, filename, URL displayed by the UI, or logs.
5. Display-range changes slice an already adequate dataset locally. Fetch only if the requested coverage is absent and the user initiates an action that needs more history.
6. Indicator and theme changes never trigger network requests.
7. Explicitly configure TanStack Query: disable automatic focus/mount/reconnect refetches and automatic retries for live-provider queries. Load/Refresh controls requests; deduplicate identical in-flight requests.
8. Cancel obsolete search/history requests. A slower old response must not replace a newer listing selection.
9. Cache retention and refresh policy must respect provider terms. For daily data, prefer reuse within the relevant trading session and explicit stale indicators rather than a universal 15-minute timer.
10. Treat quota responses inside HTTP-success JSON as errors too. Show a countdown only when the reset time or `Retry-After` is known. Do not fabricate remaining credits.
11. Preserve loaded charts if refresh fails and visibly mark their source/date/staleness. Never switch to demo data automatically.
12. Persistent caches contain normalized permitted data and non-secret metadata only, never credentials, raw request URLs, or authenticated response envelopes. Bound cache size and provide clear-cache controls.

### Browser credential rules

- Keep keys in memory by default. Never put real keys in source, `.env` committed to Git, screenshots, tests, exported files, logs, analytics, query keys, or service-worker caches.
- A user may opt into “Remember on this device.” Explain briefly that this saves the key in browser storage and is not an OS credential vault. Store keys separately from the general Zustand persisted store.
- Connection tests run only on user action and explain that they may consume provider credits.
- Disconnect deletes that provider's saved key, clears its in-memory credential/session state and authenticated query cache, and resets the connected dataset. Imported/demo datasets remain available.
- Redact provider-required key query parameters from errors and diagnostics. Some provider endpoints require query-string keys; do not promise that the browser's own developer tools cannot see them.
- Service-worker runtime caching must exclude all market-data/authenticated requests, including cross-origin provider requests.

## 5. Theme and interface requirements

### Glass Light now, additional themes later

Use semantic CSS variables for page background, surface, elevated surface, border, text, muted text, accent, positive, negative, focus ring, shadow, radii, and spacing. Store a typed theme definition with both CSS values and a matching chart palette. Apply it through a root `data-theme` attribute.

Components consume semantic tokens; they must not hardcode an independent palette. Register themes by ID and keep a stored preference schema that accepts later IDs. Unknown IDs fall back to Glass Light. Do not build unused dark/neon themes now.

Glass appearance:

- Pale static blue/lilac gradient backdrop; no distracting animated background.
- Translucent white panels, fine borders, modest shadows, restrained corner radii.
- Limited `backdrop-filter` on outer cards only, with an opaque fallback and a user-selectable reduced-effects mode.
- Plot areas use a quiet, sufficiently opaque surface. Grid lines, axes, labels, and crosshairs stay legible over the glass.
- Text and controls meet WCAG AA contrast targets. Up/down meaning also uses signs or text, not color alone.
- Respect reduced-motion preferences. Do not blur every nested control or place decorative animation behind charts.
- Theme application updates existing chart options; it does not refetch data, recalculate indicators, or discard zoom.

### Workspace

- Header: app name, mode/source badge, search, provider status, interval, range, Load/Refresh, and settings.
- Initial landing state: clear choices for Try Demo, Import CSV, and Connect Provider. The app is usable before any key is entered.
- Summary: listing, exchange/currency, latest available candle close, previous-bar change, volume if available, actual data date, and freshness. Label daily changes as previous-session changes; weekly/monthly changes as previous-bar changes.
- Show 52-week high/low only when sufficient daily coverage exists; otherwise state unavailable. Keep it independent of the visible range.
- Main chart: candlesticks with a line/area toggle, volume pane, and optional price overlays.
- Default lower panes: RSI, MACD, and ATR. Additional indicators are enabled from grouped controls rather than all being mounted by default.
- Groups: Price & Trend, Momentum, Volatility, and Volume. Panels support show/hide, collapse, expand, and reset.
- Each indicator shows its name, parameters, latest valid value and its time, units, a short calculation tooltip, and an honest unavailable state.
- “Latest valid” must not appear as the latest candle value if it belongs to an earlier candle; expose its actual time, especially for displaced series.
- Sync time ranges and crosshair across visible time-series panes/charts with loop guards and proper listener cleanup. Preserve the view on parameter/theme changes where possible.
- Controls are keyboard accessible; `/` focuses listing search unless focus is already in an editable field. Provide visible focus, labeled inputs, and accessible status messages.
- Responsive at approximately 375, 768, and 1280+ pixels. Collapse controls on narrow screens. Charts must not cause page-wide horizontal scrolling.
- Footer includes provider/source attribution, fetch time separately from data time, required chart-library attribution, and “For informational purposes only. Not financial advice.”

## 6. Calculations and selected visualizations

The v1 target is **15 distinct visualizations/features**, not 15 unrelated indicator formulas or 15 simultaneously visible cards. Price overlays can share the main chart.

| # | Visualization | Default parameters | Delivery |
|---|---|---|---|
| 1 | Candlestick with line/area toggle | OHLC/close | Phase 1 |
| 2 | Volume histogram and volume average | SMA 20 | Phases 1 and 3 |
| 3 | SMA overlays | 20, 50, 200 | Phase 3 |
| 4 | EMA overlays | 12, 26 | Phase 3 |
| 5 | Bollinger Bands | 20, 2 standard deviations | Phase 3 |
| 6 | RSI | 14, Wilder smoothing | Phase 3 |
| 7 | MACD line, signal, histogram | 12, 26, 9 | Phase 3 |
| 8 | Slow stochastic oscillator | 14, 3, 3 | Phase 5 |
| 9 | ATR | 14, Wilder smoothing | Phase 3 |
| 10 | OBV | Documented starting baseline | Phase 3 |
| 11 | ADX with +DI and -DI | 14, Wilder smoothing | Phase 5 |
| 12 | CCI | 20 | Phase 5 |
| 13 | Williams %R | 14 | Phase 5 |
| 14 | Rate of Change | 12, percentage | Phase 5 |
| 15 | Rolling historical volatility | 20 bars, documented annualization | Phase 5 |

Daily/period returns and distance from SMA-200 may be small numerical views in Phase 5. They are not extra mandatory chart cards.

### Calculation contract

- Functions are independent of React, provider calls, storage, browser globals, and chart APIs.
- Input is the complete validated history. Output retains input alignment with `null` for unavailable values. Multi-output indicators return named aligned series.
- Calculate before slicing the visible date window; a range change must not reset EMA seeds, OBV accumulation, or other cumulative calculations.
- SMA-200 needs at least 200 relevant bars. For recursive indicators, document seed/initialization conventions and fetch additional preceding history where possible. Matching only nominal period length does not guarantee convergence with another implementation.
- Document EMA seeding; RSI/ATR/ADX initialization and Wilder smoothing; stochastic fast/slow definitions; Bollinger variance convention; MACD signal initialization; and OBV baseline.
- Document deterministic conventions for flat prices, zero denominators, zero-range bars, missing volume, and incomplete candles. Never emit Infinity or unhandled NaN. A legitimately zero result remains zero; only unavailable results use null.
- Define historical volatility as sample standard deviation of log returns over the selected number of returns, annualized by a documented factor. Default stock factors: 252 daily bars, 52 weekly bars, 12 monthly bars. Label it “20-period” on non-daily views and document these approximations.
- Validate parameters: finite values, positive integer periods, appropriate bounds, and sensible relationships such as MACD fast < slow. Invalid edits do not destroy the last valid chart.
- Preserve timezone/session identity. Local weekly/monthly aggregation uses first open, maximum high, minimum low, last close, and summed known volume. Do not combine volume into a known total if any constituent has unknown volume. Expose partial groups and coverage limitations.
- Incomplete trailing groups/candles must be labeled; do not silently treat them as finalized historical bars. Calculate finalized indicators by default and disclose any provisional display.
- Export computed nulls as empty cells, preserving row/time alignment. Include adjustment/source/interval conventions in a compact metadata preamble or documented companion metadata download.

### Verification rules

Use small auditable OHLCV fixtures and independently generated reference values from a trusted implementation such as TA-Lib. Store the reference implementation/version, input fixture, parameters, initialization conventions, and numerical tolerances with each fixture. Reference tooling is a developer tool, not a user runtime dependency.

Test short history, ordinary trends, flat series, gaps, missing volume, zero-range bars, and corporate-action consistency. Do not merely duplicate production formulas in test expectations. UI unavailable states must match calculation results.

## 7. Seven-phase implementation plan

Every phase ends with a runnable increment, its relevant checks, and an updated progress record. Finish the current phase before expanding scope.

### Phase 1 — Repository, glass theme, and working demo

**Goal:** A user can explore a real interactive chart without entering a key.

**Implement:**

- Inspect the repository and applicable `AGENTS.md` instructions; scaffold React/TypeScript/Vite if appropriate.
- Set up linting, formatting, typechecking, build scripts, Vitest, and a committed lockfile.
- Implement semantic theme tokens, Glass Light, a shared GlassPanel, responsive app shell, and accessible controls.
- Define candle/listing/dataset types and the initial normalization contract.
- Bundle a deterministic synthetic daily dataset with enough history for later SMA-200 tests; clearly label it as synthetic demo data.
- Render a working candlestick chart, volume pane, line/area toggle, summary, basic range selector, chart reset, and source/data timestamps.
- Build explicit initial, loading, empty, and unexpected-error states. Provide provider/import entry points with honest “coming next phase” states until implemented.
- Add concise project conventions and `docs/implementation-progress.md` with seven phase entries.

**Acceptance:**

- Demo requires no network credentials and renders interactive price/volume data.
- Chart cleanup works through React remounts; no duplicated listeners or chart instances.
- Header and chart fit at narrow and desktop widths; no page overflow.
- Glass tokens reach both HTML controls and chart palette. Reduced effects and opaque fallback preserve legibility.
- Typecheck, lint, tests relevant to initial normalization, and production build pass.

**Handoff:** Report files changed, checks, how to run, and any unfinished items. Mark only Phase 1 complete.

### Phase 2 — Data integrity, CSV import, and local persistence

**Goal:** Users can load their own data reliably and retain useful local work.

**Implement:**

- Complete provider interface, metadata, typed errors, dataset validation, and normalization.
- CSV upload with template download, preview, header mapping, date/interval/timezone/currency/adjustment selection, and explicit imported-data attribution.
- Support quoted fields and date/OHLC/optional-volume columns. Reject material errors with row-specific feedback; never silently guess locale-dependent dates or thousands/decimal separators.
- Bound file size/candle count with documented defaults and useful messages; support at least 5,000 valid candles.
- Require a user-supplied exchange timezone when needed to interpret timestamps; retain dates for daily files.
- Implement IndexedDB dataset persistence and versioned preferences. Handle storage denial/quota failures without preventing session-only use.
- Add recent datasets/listings, Delete Dataset, Clear Cache, and Reset Preferences controls with explicit scope.
- Implement pure weekly/monthly aggregation helpers and test them; initially keep the UI daily-first until Phase 5.

**Acceptance:**

- Valid CSV works without an API key; demo, import, and live identities cannot be confused.
- Unsorted rows normalize correctly; missing volume disables volume-dependent calculations honestly.
- Invalid OHLC, ambiguous dates, conflicting duplicates, and unavailable metadata produce actionable feedback.
- Reload restores selected non-secret preferences/datasets; storage failure falls back to usable memory mode.
- Normalization/import/aggregation tests and required quality checks pass.

### Phase 3 — Core calculations and readable chart workspace

**Goal:** A validated dataset powers the core technical dashboard.

**Implement:**

- Pure SMA, EMA, volume average, Bollinger Bands, RSI, MACD, ATR, and OBV modules with documented conventions and independent fixtures.
- Typed named outputs, aligned null warm-up values, validated parameters, and memoization by dataset revision and parameters.
- Main-chart overlays, RSI/MACD/ATR panes, optional OBV panel, legends, latest valid values/times, and formula tooltips.
- Grouped visibility controls; hide rather than mount all panels by default.
- Initial synchronization of visible chart ranges/crosshairs with recursion guards; cleanup and reset behavior.
- Consistent insufficient-history/missing-volume/unavailable states per calculation.

**Acceptance:**

- Reference fixtures match within documented tolerances.
- Changes to visible range preserve values for overlapping timestamps.
- Parameter edits change calculations without data fetching; invalid edits are handled clearly.
- Zero values remain valid; unavailable values are not plotted as zero.
- Theme changes do not refetch or reset chart ranges.
- At least 5,000 candles remain usable in the core workspace; record any measured bottlenecks.

### Phase 4 — Twelve Data integration and quota-safe requests

**Goal:** One provider works end to end with honest access limitations.

**Implement:**

- Check current official documentation for endpoint access, browser CORS, quotas, credits, listing search, adjustments, history limits, and applicable display/cache terms. Record sources and verification date in `docs/providers.md`.
- Twelve Data symbol/company search with debouncing, request cancellation, and exchange-aware selection.
- Masked key field, show/hide, user-triggered Test Connection, memory default, optional Remember, and Disconnect.
- Daily OHLCV adapter; capability-aware ranges and adequate preceding-history requests when possible.
- Correct query keys and explicit manual-request policy; bounded caching; no automatic live retries or focus refetches.
- Typed errors for HTTP and JSON-payload failures; stale-data retention after failed refresh.
- Actual source time, fetch time, currency/timezone, interval, coverage, and delay status in the UI.

**Acceptance:**

- Successful, invalid-key, quota, unknown-listing, empty, malformed, CORS/network, cancellation, and outage paths are fixture-tested.
- Parameter/theme/chart visibility changes make zero provider requests.
- Switching range/listing/provider does not return the wrong cached dataset or apply a stale response.
- Keys are absent from exports, logs, screenshots, persisted UI state, query keys, and dataset caches.
- Verify against a real user-provided key only if available. Otherwise label this phase “fixture-tested; live verification pending” rather than claiming a live pass.
- Quota guidance reflects current documented access, not hardcoded promises of all-market coverage.

### Phase 5 — Complete indicator set and interval semantics

**Goal:** Deliver the selected 15 visualizations with consistent definitions.

**Implement:**

- Slow stochastic, ADX/+DI/-DI, CCI, Williams %R, ROC, and rolling historical volatility with independent references and edge-case tests.
- Daily/weekly/monthly interval controls according to available capabilities. Use provider bars or labeled local aggregation; preserve aggregation provenance and partial-group status.
- Document stock annualization factors and period terminology. Never label a 20-week window as 20 days.
- Optional summary numbers for daily/period returns and price distance from SMA-200, each unavailable when required inputs are absent.
- Complete reference lines as neutral chart guides; no trade interpretations.
- Calculate all indicators on available pre-window history; show actual coverage and insufficient-history states for limited provider plans.

**Acceptance:**

- All selected calculations have auditable references and meaningful edge-case tests.
- Weekly/monthly OHLCV aggregation and partial periods behave as documented.
- Currency/timezone and adjusted/raw conventions remain visible and consistent.
- 52-week metrics use sufficient daily coverage or show unavailable, rather than calculating from an arbitrary visible range.
- Calculations are unchanged by opening/closing panels or selecting themes.

### Phase 6 — Alpha Vantage, workspace controls, and CSV export

**Goal:** A polished usable dashboard works across two supported providers.

**Implement:**

- Add Alpha Vantage through the shared adapter contract after checking current free/premium endpoints, quotas, supported history, CORS, and terms.
- Use accessible daily/weekly/monthly endpoints only where verified; adjusted daily history must not be assumed free. Do not replace only close with adjusted close inside raw candles.
- Provide capability-aware provider switching; show unsupported/premium features clearly. Avoid automatic cross-provider substitution.
- Finish editable parameters, grouped panels, expand/reset controls, a local watchlist that fetches only the selected listing, and keyboard accessibility.
- Finish synchronized ranges/crosshairs across all visible panels, preserving their view on settings changes where reasonable.
- CSV export of loaded OHLCV plus named calculated series, aligned timestamps, empty unavailable values, and documented source/adjustment/parameter metadata.
- Escape CSV fields correctly and protect imported text fields from spreadsheet formula interpretation.
- Persist layout and parameters with validation/migrations; isolate credentials from these preferences.

**Acceptance:**

- Both provider adapters pass normalized fixture/error tests; explicitly list live verification status for each.
- Disconnect clears credentials and connected-provider session/query state as specified.
- CSV rows and each output series match the active dataset and parameters, including warm-up values and visible/full export choice.
- Chart synchronization does not loop, jump repeatedly, or leak listeners.
- Parameter/search/visibility controls work by keyboard, and status/error text is understandable.
- The dashboard remains usable when only some indicators are available.

### Phase 7 — PWA, performance, cross-platform verification, and open-source release

**Goal:** Prepare a trustworthy browser release that users can open easily.

**Implement:**

- Add a manifest, icons, standalone display where supported, app-shell precaching, offline handling, and a controlled update prompt.
- Keep all market-data/authenticated requests outside service-worker caching. Use the explicit dataset store for permitted offline data.
- Offline demo/import/cache views show their source/date and cannot pretend to be refreshed live data.
- Hide unavailable install controls; provide browser-specific instructions only after verifying current support. Do not make installation a requirement.
- Profile the built application with at least 5,000 candles and typical visible panels; record device/browser, timings, and interactions. Optimize measured problems, using a worker only if necessary.
- Add meaningful end-to-end checks for demo, import, connect/load, stale refresh, panel parameters, theme application, export, disconnect, reload, and offline behavior.
- Verify Chromium and Firefox browser use, and Safari/WebKit behavior. Label actual Windows/macOS device checks separately from automated engine checks; do not claim OS testing that was not performed.
- Write README with developer setup, hosted-user instructions, CSV template, keys, data limitations, privacy/storage controls, PWA/offline behavior, and troubleshooting.
- Add MIT LICENSE, dependency/TradingView notices and required visible attribution, CONTRIBUTING, SECURITY reporting instructions, CHANGELOG, and CI.
- Document static-host deployment with correct Vite base paths and no routing assumptions. No paid hosting or domain is required by the plan. Do not publish to an external host merely to claim completion; prepare a runnable build and deployment instructions.

**Acceptance:**

- Typecheck, lint, reference tests, production build, and relevant end-to-end checks pass.
- The production build works from a static server, including an appropriate subpath test if documented for GitHub Pages.
- A previously loaded application can reopen offline with demo/imported/permitted cached data; fresh live requests show an offline state.
- Service-worker caches do not contain provider requests or keys; updates do not silently discard imported data/settings.
- Glass styling remains legible with reduced effects and on narrow screens; no page overflow.
- The README separates automated verification, real-key verification, actual device checks, and pending work.
- The seven-phase progress record is accurate and no unfinished requirement is presented as complete.

## 8. Deferred features and excluded assumptions

Do not quietly expand the seven-phase scope with these features:

| Feature | Why deferred / condition for adding |
|---|---|
| Additional themes | Theme registry/tokens are ready now; visual themes can be implemented separately later |
| Electron/Tauri installers | Browser distribution is the accepted first-release goal |
| Yahoo Finance adapter | Unofficial access and browser CORS need a separate optional local-proxy design; no public third-party proxy or scraping bypass |
| Intraday session VWAP | Requires supported intraday volume, correct exchange-session resets, and documented bar-price approximation |
| Ichimoku Cloud | Requires displaced-series types, lookahead-safe plotting, warm-up rules, and specific reference/export tests |
| MFI, CMF, Parabolic SAR, accumulation/distribution | Additional calculations after the chosen 15 are verified |
| Volume profile | Actual volume by price is not recoverable from daily OHLCV alone |
| Peer correlation / multi-symbol comparison | Requires extra aligned datasets and provider quota planning |
| Streaming, alerts, drawings, backtesting | Material expansion of product and data requirements |
| AI interpretations, forecasts, buy/sell signals | Outside this visualization-only product |
| Account system, broker connection, orders, portfolio accounting | Outside the selected first-release dashboard |

Finnhub is not an initial historical-data provider. A provider's advertised free request rate does not imply access to its historical candle endpoint. Open-source application licensing does not make third-party market data open or freely redistributable.

## 9. Implementation workflow

Read the complete plan before implementing a phase. Finish the requested phase, run its acceptance checks, fix failures within scope, and update `docs/implementation-progress.md`. Stop at the phase boundary for review unless several phases have been requested together.

Keep demo, import, and live modes explicit. Independently test calculations and document provider limitations. Use official documentation for library and provider behavior. Record decisions and verification limitations; never claim checks, live access, or device verification that have not been performed.

For each phase record its status (`not started`, `in progress`, `implemented / verification pending`, or `complete`), implemented scope, checks and results, unresolved limitations, and next action. Required verification that is unavailable must remain explicitly pending.

## 10. Official references to verify during implementation

These sources informed the plan. Provider access and browser support can change; verify the relevant sections before integration and record the check date.

- [React documentation](https://react.dev/)
- [Vite documentation](https://vite.dev/guide/)
- [Tailwind CSS documentation](https://tailwindcss.com/docs)
- [Lightweight Charts documentation](https://tradingview.github.io/lightweight-charts/)
- [Lightweight Charts panes](https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes)
- [Lightweight Charts repository and attribution](https://github.com/tradingview/lightweight-charts)
- [TanStack Query query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [TanStack Query important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [Twelve Data documentation](https://twelvedata.com/docs)
- [Twelve Data pricing](https://twelvedata.com/pricing)
- [Twelve Data exchange coverage](https://twelvedata.com/exchanges)
- [Alpha Vantage documentation](https://www.alphavantage.co/documentation/)
- [Alpha Vantage API-key support and quotas](https://www.alphavantage.co/support/api-key/)
- [Vitest documentation](https://vitest.dev/guide/)
- [Playwright documentation](https://playwright.dev/docs/intro)
- [Vite PWA documentation](https://vite-pwa-org.netlify.app/)
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

Plan complete. The deliverable is an implementation specification; no application code or deployment is claimed by this file.
