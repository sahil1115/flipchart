# Phase 7 verification — 9 October 2026

Status: implemented / verification pending — automated acceptance checks delivered; actual device and real-key checks pending. Actual macOS/Safari/native installation and real account verification remain pending. No external deployment or hosted CI run is claimed.

## Scope and boundaries

Production-only PWA registration, manifest with 192/512/maskable/touch icons and optional standalone display. Install controls require a browser-provided event; no user-agent guess or mandatory installation. The offline-ready announcement lives in the footer to avoid shifting initial controls as the worker finishes. Updates remain waiting until **Update and reload**; **Later** leaves the current worker active. The prompt warns about pending work and memory-only live credentials/data.

Custom Workbox worker routes only exact precache assets and root/index.html navigation inside its deployment scope. It rejects other origins, all query strings, POST and credential headers. There is no provider/runtime cache or broad SPA navigation fallback. The IndexedDB library continues to accept demo/import only; live datasets remain session-only. Offline source/data dates remain visible and fresh provider actions receive a typed offline error. Browser online signals are hints, not proof of internet reachability; ordinary network/CORS errors remain safe and retain loaded charts.

MIT license, upstream license inventory and TradingView NOTICE are included in source and static output. Visible TradingView attribution remains; footer links expose license/notices. Build regenerates the inventory from the committed lockfile and installed packages, including development tools. Text notices are not offline precache entries. Code licensing grants no market-data redistribution rights.

## Reproduction commands and environment

```powershell
npm ci
npm run check
$env:FLIPCHART_BROWSER_PATH = 'C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe'
npm run test:e2e
npm run test:subpath
```

Windows host; OS release 10.0.26200; Intel Core i3-1315U, eight logical CPUs. Automated engines: Chromium 143.0.7499.4 (existing executable override), Firefox 157.0 / Playwright build 1555 and WebKit 27.2 / build 2370. Playwright 1.64.0; Vite 8.3.4; PWA plugin 2.0.0; Workbox 7.4.1. Firefox/WebKit were installed for this phase. These are browser-engine runs on this Windows host, not physical macOS/Safari certification or manual installed-app checks.

## Actual check results

- `npm run check`: strict typecheck, lint, formatting, 145 unit/reference tests in 21 files and production build pass. Final release-file formatting/quality confirmation is recorded in the progress handoff.
- Full single-worker regression: 131/132 passed. The remaining failure was the prior WebKit sequential-link-Tab assertion. After correcting the test to cover the available Windows engine behavior, all three targeted keyboard cases passed, and `npm run test:e2e -- --last-failed` passed the remaining WebKit case. All 132 unique final cases therefore have passing evidence; this is an aggregate full-run-plus-targeted-correction result, not a claimed new all-green full run.
- Focused PWA/profile run: all 12 cases passed across Chromium/Firefox/WebKit.
- `npm run test:subpath`: final static prefix, manifest/scope, offline imported CSV, authenticated/query bypass, waiting/Later/explicit update and retained imported dataset/RSI 7 pass.
- 375/768/1440 overflow and reduced-effects/opaque fallback checks pass across engines. Mobile/desktop chart captures were visually inspected; generated screen captures are ignored local artifacts.
- Dependency consistency install audited 526 packages with zero reported vulnerabilities at the verification time. Hosted CI execution remains pending.

## Test design and corrections

The 44 workflows per engine cover demo, daily import/validation, local library reload/deletion/cache scopes, denied/quota storage, chart/parameter/interval changes, reduced effects/themes, 375/768/1440 overflow checks, provider fixtures and stale recovery, explicit credential handling/disconnect, watchlist selection, keyboard controls, full/actual-visible CSV and metadata exports, offline reopening and install-event dismissal. Independent numeric reference fixtures remain part of the unit suite.

Provider fixture files block service workers so interception is deterministic across engines. Worker tests run separately with real registration and use a local API-shaped query probe plus authenticated app-asset fetches; external provider origins are explicitly rejected by policy tests. No real account/key is needed. The initial cross-engine attempt exposed WebKit mock interception limitations on controlled pages; the final fixture harness removes that external-network dependency.

Playwright's network-offline setting can reset navigator.onLine on a worker-served reload. Offline tests block network and separately set the browser offline signal on the reloaded document. Authenticated cache-bypass probes use cache:no-store to exclude the ordinary browser HTTP cache from the assertion. These are deliberate test-emulation details, not changes to the product's navigator implementation. Native installation is not simulated as a successful device install; the event test verifies offered/dismissed UI behavior only.

Firefox revealed an IndexedDB watchdog race: aborting a committed transaction before its completion event arrived threw InvalidStateError. The backend now waits for that completion and uses a bounded ten-second open/transaction deadline instead of three seconds. A focused regression test simulates exactly that event ordering. Readiness layout shift was also removed; initial keyboard tests now wait for mounted controls. Windows WebKit skipped the first link with both plain Tab and the documented macOS Option/Alt-Tab shortcut. Inspected active-element behavior confirmed direct focus plus Enter activates the skip link and focuses main. Chromium/Firefox test sequential Tab; WebKit tests focus/Enter activation and button/parameter keyboard use. Native OS link traversal remains pending with actual Safari/device checks, rather than being represented as a passed Tab-traversal test. Full workflows have a 60-second harness deadline for engine startup/full-page screenshot overhead; functional assertions retain their normal bounded waits.

## Static host and update check

The dedicated localhost server serves only a /flipchart/ prefix, without SPA rewriting. Its test builds into dist-subpath, verifies manifest URL/scope, reopens an imported CSV offline, retains RSI 7, rejects authenticated/query asset cache reads, installs a byte-changed waiting worker, checks Later, explicitly reloads and confirms imported identity and parameters survive. The revision endpoint exists only in the verification server. Root builds use the normal production preview. See [deployment guide](deployment.md) for base paths, headers and release retention.

## Performance and remaining verification

The production profile imports 5,000 varied finalized OHLCV candles with price/SMA, volume/SMA, RSI, MACD and ATR visible. It records validate/load, parameter application, range, pan, zoom and full export using browser performance.now and two animation frames. Three extra direct DOM parameter clicks separate browser processing/rendering from Playwright actionability overhead, and Long Task entries are recorded only where supported. One unthrottled run per engine is an observation, not a benchmark or guarantee on other hardware. The final build observations are below (milliseconds, rounded). Host background work was not controlled. These are not product latency guarantees.

| Engine   | Validate/load | Apply (driver) | Range | Pan | Zoom | Export | Direct redraw median |
| -------- | ------------: | -------------: | ----: | --: | ---: | -----: | -------------------: |
| chromium |           776 |            316 |   128 | 233 |  118 |    579 |                  171 |
| firefox  |          1015 |            518 |   261 | 126 |   74 |    481 |                  245 |
| webkit   |          1819 |            968 |   818 | 714 |  424 |    936 |                  318 |

Build main bundle is 551.89 kB / 175.20 kB gzip, with a non-fatal 500 kB advisory; worker about 15.96 kB / 5.29 kB gzip and 16 shell entries about 576 KiB. PWA's worker build also emits an upstream inlineDynamicImports deprecation warning under Vite 8. Neither advisory is suppressed. The measured redraw path rebuilt all native indicator series on each parameter edit. It now updates existing series when pane/series structure is unchanged, recreates them when visibility/availability changes, preserves the range before replacement and retains chart-owned cleanup. Unit assertions explicitly verify reuse and structural replacement. Direct Chromium samples improved from 211–221 ms before to about 170–186 ms after; Firefox before was 362–395 ms. Final per-engine observations and raw [baseline/optimized measurements](phase-7-performance.json) are retained. Final direct redraw medians were approximately 171 ms Chromium, 245 ms Firefox and 318 ms WebKit; baselines were 211 ms Chromium and 379 ms Firefox. WebKit has no directly comparable baseline in that record. Long tasks remain; no pure-calculation bottleneck requiring a worker was established. A worker would not eliminate native chart rendering, and slow-device/50,000-row performance is not certified.

Pending: actual macOS/Safari and native install/standalone and native OS link-tab traversal checks; both providers' real user-key/account/history/production-origin CORS checks; hosted CI execution and chosen-host deployment. The local runnable build and instructions are delivered without publishing. Earlier phase provider verification statuses remain unchanged.

## Official references checked

- [Vite PWA custom worker / injectManifest](https://vite-pwa-org.netlify.app/guide/inject-manifest)
- [Prompt for update](https://vite-pwa-org.netlify.app/guide/prompt-for-update)
- [Apple Safari keyboard shortcuts](https://support.apple.com/en-gb/guide/safari/cpsh003/mac) and [Playwright maintainer guidance](https://github.com/microsoft/playwright/issues/5609): Option/Alt-Tab link navigation.
- [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [TradingView 5.2.1 NOTICE](https://raw.githubusercontent.com/tradingview/lightweight-charts/v5.2.1/NOTICE)
- [Checkout](https://github.com/actions/checkout), [Setup Node](https://github.com/actions/setup-node), [Upload Artifact](https://github.com/actions/upload-artifact): current official v7 usage checked for the CI configuration.
