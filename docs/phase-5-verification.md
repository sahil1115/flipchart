# Phase 5 verification

Status: **complete**. Implementation: remaining six indicators, local weekly/monthly views, interval-aware annualization, neutral chart guides and daily coverage metrics. Phase 6 has not started.

## Changes and decisions

`src/indicators/extended.ts` implements slow stochastic, ADX/+DI/−DI, CCI, Williams %R, ROC and sample log-return volatility. `core.ts` aligns every output to finalized source bars and uses the dataset interval for annualization. `presentation.ts`, indicator cards/controls and `PriceChart.tsx` expose optional grouped panes, parameters, units, formula disclosures and neutral reference lines. The selected 15 features are now available; additional panes remain off by default.

`DatasetWorkspace.tsx` exposes Daily/Weekly/Monthly. Weekly/monthly are explicitly local views of daily input, using the existing tested `aggregateDaily` contract. Aggregation preserves listing currency/timezone, adjustment, original retrieval/source data and group coverage/provenance. No provider weekly/monthly access is inferred or requested. Non-daily source datasets cannot be aggregated again. Groups use source date calendar boundaries and period-start labels; actual constituent dates/counts and partial status remain in metadata. Missing weekdays, including unverified exchange holidays, conservatively mark groups partial and exclude them from finalized calculations. This can materially reduce usable weekly/monthly history.

The complete history feeds calculations before calendar range slicing. Periods count observed finalized bars at the chosen interval, with daily/weekly/monthly volatility factors 252/52/12. Interval selection only changes local data. The provider warm-up allowance reflects all parameter requirements plus 300 recursive warm-up periods, approximated as 5/23 daily sessions for weekly/monthly views. Only explicit Load history requests more; endpoint/account limits can prevent sufficient coverage, and unavailable states remain visible.

`summary.ts` computes 52-week high/low and distance from daily SMA-200 using full finalized daily input, independently of the visible range and interval. High/low requires the entire 364-day calendar span and at least 252 observed finalized daily bars within it. This conservative rule can report unavailable for an otherwise usable market year with fewer sessions. Distance requires 200 finalized daily closes and a finite nonzero average. Metrics include their actual finalized date; partial/provisional closes are excluded.

Chart range buttons now use calendar month/year boundaries for every interval rather than treating a month as 22 weekly or monthly candles. Theme changes update existing series/reference-line options and preserve zoom. Formula/card values retain exact source dates; aggregated timestamps are disclosed as period labels.

## Independent calculation evidence

`tests/fixtures/generate-extended-reference.py` imports no application code. It uses the existing ignored developer-only TA-Lib Python 0.8.1 / C library 0.8.1 (21 September 2026) and NumPy 2.5.3 tooling. `extended-reference.json` records inputs, default/alternate parameter sets, a flat zero-range fixture, all aligned outputs, versions and tolerances. Existing Phase 3 reference fixtures remain unchanged.

New indicator outputs are compared at every timestamp, including null warm-up, within absolute 1e−8 plus relative 1e−10. Volatility uses independent NumPy `std(ddof=1)` of log returns at all three annualization factors. Additional tests exercise short history, flat/monotonic series, directional ties, missing volume, gaps, adjusted OHLC scaling, provisional exclusion, zero ROC denominator, non-positive log-price recovery, overflow and parameter rejection. Summary tests verify coverage and provisional exclusion; hand-audited aggregation tests cover full/partial weeks, leap months, calendar/year boundaries, unknown/zero volume and preserved timezone/adjustment.

Regenerate references only with the optional developer tooling:

```sh
python tests/fixtures/generate-extended-reference.py
```

The generated JSON is committed. Python/NumPy/TA-Lib are not application or end-user dependencies.

## Final checks

Strict typecheck, ESLint, Prettier, **122 unit tests in 17 files** and production build passed. **36 production-preview Chromium tests** passed, including the 32 earlier-phase regression flows and four Phase 5 flows. Commands:

```powershell
npm run check
$env:FLIPCHART_BROWSER_PATH = 'C:\Users\sahil\AppData\Local\ms-playwright\chromium-1200\chrome-win64\chrome.exe'
npm run test:e2e
```

No new dependency or external deployment. Provider verification remains fixture-based; no real key was supplied. Actual Firefox/WebKit/macOS/Safari verification, PWA, persistent layout/parameters and export remain later-phase work. The existing non-fatal bundle-size advisory remains; broad release profiling belongs to Phase 7.

| Acceptance                                       | Evidence                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All selected calculations independently verified | Original core references plus new every-output TA-Lib/NumPy comparisons and meaningful edge tests pass. The selected 15 features appear through default/optional grouped controls.                                                                                                                          |
| Aggregation and partial status                   | Hand-audited OHLCV/provenance tests pass for full/partial weeks, leap months and cross-year groups. Browser checks show labeled weekly/monthly views, partial exclusion and short-history unavailability. Native input/requests remain daily; no access assumption.                                         |
| Currency/timezone/adjustment consistent          | GBP/Europe-London raw CSV remains raw in monthly view. Provider fixtures preserve USD/GBP and exchange timezone; interval transitions generate zero provider requests. Daily input metadata and actual group source ranges remain available.                                                                |
| Daily 52-week coverage                           | Tests reject short input and incomplete outliers; browser metrics stay identical across ranges and weekly/monthly views. Daily SMA-200 distance is independently dated and unavailable for short input.                                                                                                     |
| Values unchanged by visibility/theme             | ROC latest value survives hide/show, reduced-effects and range changes at all three widths; returning to daily restores its original value. Chart ownership tests preserve zoom and instances while neutral guide colors update. Calculation caching remains independent of display state.                  |
| Responsive/no regression                         | All checks at 375/768/1440 fit without horizontal overflow or page exceptions. Ignored `verification/screenshots/extended-chart-*.png` and `extended-cards-*.png` capture all optional panes/cards; mobile and desktop charts visually inspected. All prior-phase flows and the 5,000-candle workflow pass. |

The first short-history browser fixture expected raw prices without declaring its import adjustment; the application correctly displayed unknown. The fixture now explicitly selects raw and the complete suite passes. A chart test was updated from the old fixed 22-bar month to its actual calendar boundary. Theme reference-line styling was kept in the options effect so existing series/view ownership stays intact.

## Review locally

Run `npm ci` then `npm run dev`, open `http://127.0.0.1:5173` and choose Try Demo or Import CSV. Enable the additional indicators under grouped controls. Use Interval to inspect labeled weekly/monthly aggregation, open Calculation to review units/factors, and compare daily coverage metrics across range/interval changes. Provider loads use the existing explicit Data connection flow. Stop for Phase 5 review.
