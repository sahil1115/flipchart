# Phase 3 verification

Verification date: 9 October 2026. Scope: core calculations and the readable daily workspace, preserving Phases 1–2. Final acceptance checks passed. Work is stopped for review before Phase 4.

## Acceptance evidence

- Independent references: every aligned SMA/EMA/volume-average/Bollinger/RSI/MACD/ATR/OBV output matches the checked-in TA-Lib reference at default and shorter parameter sets. Null warm-up alignment is exact; numeric tolerance is absolute 1e-8 plus relative 1e-10. Versions, fixture, generator, seeds and edge behavior are in [calculation conventions](calculations.md).
- Full-history invariance: calculation/revision cache tests and browser range changes preserve overlapping dated values. Recursive and cumulative calculations use the complete finalized history, independent of the visible range. Incomplete candles stay excluded with earlier latest-valid dates disclosed.
- Parameters: positive bounded integer periods, finite band deviation and ordered SMA/EMA/MACD relationships are validated. Invalid edits retain the last valid workspace; Apply and Reset operate without fetching data.
- Zero and unavailable states: flat/zero-range fixtures and browser flows preserve RSI, MACD, ATR, OBV and volume-average zeros. Null warm-up/missing-volume values are not plotted at zero. Earlier valid values have actual dates; cursor gaps do not borrow another date. Volume-dependent results are independent of price-only calculations.
- Chart ownership: one native chart time scale/crosshair synchronizes all enabled panes, eliminating mirrored callback recursion. Effect ownership guards, remount cleanup and listener pairing are unit-tested; browser remount flows check stable canvas counts. Theme changes retain the chart/time range. Hidden/wholly unavailable panes do not mount.
- Final source quality: `npm run check` passed typecheck, lint, Prettier, 85 unit tests in 12 files and production build after the final source changes.
- Browser checks: all 20 production-preview tests passed in the final run (44.9 seconds): 15 Phase 1–2 regressions and five Phase 3 flows. Configuration changes made zero external requests in the viewport flows. The final run includes proportional pane sizing and minimum-height assertions.
- Viewports/visuals: final full-page captures and chart captures recorded at 375/768/1440; chart captures inspected at all three sizes. Browser checks confirm no page overflow, shared dated cursor legends, grouped visibility, optional overlays/OBV, parameter edits, invalid preservation, reset and reduced effects. Plot/indicator pane heights remain readable after repeated configuration edits.
- 5,000 candles: the final built-browser run completed import, mounted default calculations, optional OBV, parameter apply, pan/zoom/reset and reload without page errors. Exact workflow measurements are recorded below.

## Commands and environment

```sh
npm run check
```

```powershell
$env:FLIPCHART_BROWSER_PATH = 'C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe'
npm run test:e2e
```

Windows host, Node 22.18.0, npm 11.6.4, Playwright 1.64.0, Chromium 143.0.7499.4 (bundled revision 1200). Tests use the built static output through Vite preview. Worker/browser runs use normal process permissions because restricted Windows process startup/termination can stall the harness. No real provider key was supplied or requested. No runtime dependency or lockfile change was needed in Phase 3.

Developer-only independent reference generation used locally targeted Python TA-Lib 0.8.1 / C 0.8.1 and NumPy 2.5.3. The reference wheel directory is ignored and excluded from the application. Checked-in fixture tests require only the existing Node tooling.

Initial test corrections: a UI test used a single-element locator for two intentionally unavailable SMA outputs; it now checks both and the per-series warm-up requirements. Browser canvas expectations initially assumed two canvases per added pane and captured before the chart's animation-frame paint; they now wait for rendering and account for plot plus axis canvases. Screenshot QA subsequently exposed pane squeezing from applying absolute heights during insertion; stretch weights now apply after all series are inserted. A latest-valid assertion encountered the intentionally unavailable cursor value on an incomplete candle after the upload form became a chart; the test now explicitly moves the pointer outside the chart before asserting latest values. Failed/intermediate attempts are not counted as final passes.

## Performance observations and boundaries

Final 5,000-candle observations: navigation/upload/form actions to loaded chart **991 ms**; parameter Apply to visible changed RSI **192 ms**. The full import/edit/pan/zoom/reset/reload browser test took 2.4 seconds. These timings include browser/test overhead and locator waits; they are not isolated calculation benchmarks or guarantees for other hardware. JSON measurements are written under ignored `test-results/`. No blocking bottleneck was observed at this size/default configuration; no worker or second charting library was introduced.

The workspace is daily-only. Additional indicators and weekly/monthly UI are Phase 5; durable parameter/layout preferences and full workspace controls are Phase 6. Parameter/visibility choices apply for the current session. Broad maximum-history/maximum-period profiling, offline/PWA, Firefox/WebKit, macOS/Safari and deployment verification remain Phase 7. No live-provider or universal initialization-compatibility claim is made. Bollinger variance uses a centered window calculation; very large periods/histories require the later performance review.

## Changed files and handoff

Pure calculations, outputs, cache and presentation definitions: `src/indicators/`. Independent oracle input/expected outputs and generator: `tests/fixtures/indicator-reference.json` and `generate-indicator-reference.py`. Grouped editor/value cards: `src/features/dashboard/IndicatorControls.tsx`, `IndicatorCard.tsx`, their tests and the integrated `DatasetWorkspace.tsx`. Chart integration/ownership tests: `src/charts/PriceChart.tsx` and its test. Phase label/provider-availability copy: `src/app/App.tsx`. Responsive indicator styles: `src/styles.css`. Browser flows: new `tests/e2e/indicators.spec.ts`, rendering-aware existing `demo.spec.ts`. Docs: README, calculation conventions, this evidence and progress record. `.gitignore` excludes developer reference tooling. The original implementation plan is unchanged.

Run `npm ci` then `npm run dev`; open http://127.0.0.1:5173 and choose Try Demo or Import CSV. No unresolved Phase 3 acceptance failures remain. Stopped for review; Phase 4 is not started.
