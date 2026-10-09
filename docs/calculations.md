# Calculation conventions

Implemented in Phases 3 and 5. All calculations are pure TypeScript, independent of React, charts, storage and providers. Input is the complete normalized OHLCV history in source trading-date order. Range buttons affect the chart view only. Prices are used exactly as supplied: all OHLC must share the declared adjustment convention. No adjusted close is substituted into raw candles.

## Alignment and availability

Every named series has exactly one output slot per input candle. Warm-up, unavailable and non-finite arithmetic results are `null`; chart adapters emit whitespace at those dates. Real zero values remain zero. Missing exchange sessions are never interpolated: periods count observed finalized bars, not elapsed calendar days.

Incomplete candles are excluded from the calculation sequence, with `null` placed at their original dates. A later finalized candle uses the previous finalized close. The price chart and summary may still show explicitly provisional OHLCV. Indicator cards show the actual latest valid date, label earlier values as earlier than the latest candle, and show the shared cursor's value or unavailability without borrowing another date's value.

Each period must be an integer from 2 to 5,000. Band deviation must be finite, greater than zero and at most 10. MACD and EMA fast periods must be smaller than slow periods; SMA periods must increase from short to medium to long. Invalid edits preserve the last valid chart. Parameters and visibility apply for this session; durable layout/parameter schemas remain Phase 6 work.

## Definitions and seeds

| Calculation     | Default      | Convention / first valid zero-based index                                                                                                                                                                                                    |
| --------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMA             | 20, 50, 200  | Arithmetic mean of N finalized closes; index N−1                                                                                                                                                                                             |
| EMA             | 12, 26       | N-close SMA seed at N−1; recurrence `previous + 2/(N+1) × (close − previous)`                                                                                                                                                                |
| Volume average  | 20           | N-volume SMA; any unknown volume makes that window null, later fully known windows recover                                                                                                                                                   |
| Bollinger Bands | 20, 2        | Middle = SMA; upper/lower = middle ± deviation × population standard deviation (divide by N); index N−1                                                                                                                                      |
| RSI             | 14           | First N close changes seed average gains/losses at index N; Wilder recurrence with alpha 1/N; `100 × gain/(gain+loss)`                                                                                                                       |
| MACD            | 12, 26, 9    | Fast minus slow EMA; both price seeds end at slow−1; fast seed uses its fast-length window ending there. Signal seeds with an SMA of the first signal-length differences. Line, signal and histogram are exposed together from slow+signal−2 |
| ATR             | 14           | True range = max(high−low, abs(high−previous finalized close), abs(low−previous finalized close)); first bar has no true range. First N ranges seed at index N; Wilder smoothing afterward                                                   |
| OBV             | First volume | Starts at the first finalized volume; adds current volume on a higher close, subtracts on a lower close, unchanged on equal close                                                                                                            |

RSI is 100 for gains with no losses, 0 for losses with no gains, and 0 when both averages are zero, matching the recorded TA-Lib convention. Flat zero-range candles produce ATR 0, coincident bands and MACD 0 after warm-up. No division produces Infinity or NaN in public output.

Missing volume never becomes zero. Volume average can recover after a complete known window; OBV becomes unavailable from the first unknown finalized volume onward because its cumulative baseline cannot be recovered honestly. Earlier OBV values remain usable with their actual dates. OHLC-only calculations remain available independently. Extreme magnitudes that overflow intermediate arithmetic yield unavailable output; the application does not fabricate a repaired number.

Bollinger variance uses centered squared differences to avoid subtracting two nearly equal large squared-price sums. Its work is O(history × band period), while rolling SMA and recursive calculations are O(history). The 5,000-bar browser check uses the documented defaults; maximum-size/maximum-period release profiling remains Phase 7.

## References and reproduction

The checked-in [reference fixture](../tests/fixtures/indicator-reference.json) contains 240 auditable OHLCV bars and every aligned output for two parameter sets (defaults and shorter periods). Expected values are generated independently by TA-Lib, with no import of FlipChart code. It records Python TA-Lib 0.8.1, C library 0.8.1 (build 21 September 2026), NumPy 2.5.3, default compatibility, and zero unstable periods. [Generator source](../tests/fixtures/generate-indicator-reference.py) retains the fixed integer-cent input construction, weekend/gap cadence and reference calls.

Comparison tolerance is absolute `1e-8` plus relative `1e-10 × abs(reference)` for every numeric slot; null warm-up slots must match exactly. Edge tests additionally cover short/empty history, flat/zero-range prices, known zero and missing volume, equal closes, gaps, scaling all OHLC together, incomplete bars, invalid parameters, overflow and revision/parameter cache invalidation. Standalone EMA and MACD's internally aligned EMA seeds are intentionally different at their initialization dates, following the recorded TA-Lib behavior.

Optional developer-only regeneration from the repository root:

```sh
python -m pip install --target verification/reference-tooling TA-Lib==0.8.1 numpy==2.5.3
python tests/fixtures/generate-indicator-reference.py
npm run format
npm test
```

The ignored reference tooling is never bundled or required by contributors running the checked-in tests, hosted users, or the application runtime. No runtime dependency was added for Phase 3.

Official sources checked 9 October 2026: [TA-Lib functions](https://ta-lib.org/functions/), [EMA definition](https://ta-lib.org/functions/ema.html), [RSI definition](https://ta-lib.org/functions/rsi.html). Fixture output is evidence for the stated implementation/version and conventions, not a universal promise that every chart provider uses identical initialization.

## Rendering and memoization

Dataset identity/object ownership, revision and the complete validated parameter set identify a calculation cache entry. The cache is a WeakMap with at most eight parameter sets per dataset; old revisions discard their entries. Dataset candles are immutable within a revision. View, theme and visibility changes reuse calculations and make no market-data requests.

One Lightweight Charts instance owns price/volume and the visible indicator panes. They share a native time scale and crosshair, so there are no bidirectional synchronization callbacks to recurse. A single crosshair listener updates dated legends. Only enabled groups with some available output mount chart series; hidden or wholly unavailable panes are absent. Changes rebuild indicator series while preserving the visible logical range. Theme changes update options on existing series. Effect ownership guards prevent an obsolete effect from altering a replacement chart; listeners and instances are cleaned up on remount.

The default workspace shows SMA overlays, volume average and RSI/MACD/ATR panes. EMA, bands and OBV can be enabled from grouped controls. MACD outputs have named line/signal/histogram series. Legends and formula disclosures remain available through keyboard-accessible controls. [Lightweight Charts pane/API documentation](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IChartApi) supports this single-chart ownership approach.

## Phase 5 calculations

| Calculation           | Default    | Definition and first valid zero-based index                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slow stochastic       | 14, 3, 3   | Fast %K = 100 × (close − rolling lowest low)/(rolling highest high − lowest low). Slow %K is a 3-bar SMA; %D is another 3-bar SMA. Both outputs start at N+K+D−3 (17), matching TA-Lib STOCH alignment. Zero range gives 0.                                                                                                                                                                                               |
| ADX/+DI/−DI           | 14         | Compare positive high extension and positive low extension; larger wins, ties give zero. Sum N−1 directional movements and true ranges, then apply Wilder sum recurrence `sum − sum/N + current`. DI = 100 × smoothed movement / smoothed true range from index N. DX = 100 × abs(+DI−−DI)/(+DI+−DI). ADX seeds with N DX values at 2N−1 (27), then uses Wilder averaging. Zero denominators give 0; no integer rounding. |
| CCI                   | 20         | Typical price = (high+low+close)/3; `(typical − N-bar mean)/(0.015 × mean absolute deviation)`, index N−1. A centered mean avoids false nonzero results for flat windows. Zero deviation gives 0. Unbounded index.                                                                                                                                                                                                        |
| Williams %R           | 14         | −100 × (rolling highest high − close)/(rolling highest high − rolling lowest low), index N−1. Zero range gives 0. Index normally −100 to 0 for valid OHLC.                                                                                                                                                                                                                                                                |
| ROC                   | 12         | 100 × (close / close N bars earlier − 1), index N. A zero starting close gives null (an intentional difference from TA-Lib's zero fallback). Percent, no rounding before display.                                                                                                                                                                                                                                         |
| Historical volatility | 20 returns | Sample standard deviation of N log returns (`ln(close) − ln(previous close)`, denominator N−1), multiplied by √annualization and 100; index N. Non-positive closes invalidate affected return windows; fully positive later windows recover.                                                                                                                                                                              |

Annualization factors are stock approximations: **252 daily, 52 weekly, 12 monthly bars/year**. A 20-period weekly window uses 20 observed finalized weekly returns, never “20 days.” Volatility returns percent/year; ROC returns percent over its selected periods. CCI is unbounded, Williams uses a negative index, and ADX/DI/stochastic use index units. Units and chosen interval appear in cards; formula disclosures include the annualization factor. Zero is valid; no public output is NaN/Infinity. Gaps count observed finalized periods without interpolation.

Optional panes remain off by default. RSI 30/70, stochastic 20/80, ADX 25, CCI −100/0/100, Williams −80/−20 and ROC/MACD zero lines are **neutral reference guides**, with no buy/sell labels or interpretation. Reference lines update with the chart palette without rebuilding calculations or resetting zoom.

Independent new fixtures are generated by `tests/fixtures/generate-extended-reference.py` using TA-Lib Python/C **0.8.1** and NumPy **2.5.3**. Every output, including aligned nulls, is checked for default/alternate periods and flat prices; volatility uses NumPy `std(ddof=1)` at all three factors. Tolerances remain absolute **1e−8** plus relative **1e−10**. Auditable candles include observed-date gaps and zero volume. Edge tests cover trend/ties, zero/non-positive denominators, provisional exclusion, missing volume, corporate-action scaling and overflow. The existing core oracle remains unchanged.

Primary references checked 9 October 2026: [TA-Lib STOCH source](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_STOCH.c), [ADX source](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_ADX.c), [CCI source](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_CCI.c), [WILLR source](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_WILLR.c), [ROC source](https://github.com/TA-Lib/ta-lib/blob/main/src/ta_func/ta_ROC.c), and [NIST sample standard deviation](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm). The checked-in versioned independent oracle is the numerical verification evidence, rather than an assumption of parity with changing upstream code.

## Intervals and daily summary coverage

Weekly/monthly use labeled local aggregation of full daily source history; provider requests remain daily. Grouping preserves exchange date strings and metadata, with Monday–Sunday weeks/calendar months, period-start labels and source coverage/count/provenance. Missing weekdays or any incomplete constituent conservatively flag a group partial. Unknown volume cannot become a known group sum. Holidays are unverified; historical holiday/gap groups are excluded from finalized calculations and can make indicators unavailable even for long source history. This deliberate conservative policy was introduced in Phase 2 and is now visible in the UI.

The same finalized alignment rules apply to grouped bars; excluded groups are not plotted as indicator zeros. Native aggregation helper fixtures audit OHLC, volume, leap months and year boundaries. The interval selector makes no network request. Its warm-up allowance accounts for period requirements plus 300 recursive periods, using approximate 5/23 daily sessions per weekly/monthly period. The manual provider request can still hit its 5,000-bar/account ceiling; no adequate coverage is promised. Range buttons use calendar months/years on the selected time scale. Calculation cache entries belong to a dataset with its actual interval/revision and parameters.

52-week high/low uses the **full finalized daily source**, not the visible/aggregated chart: its first date must precede the latest finalized date minus 364 days, with at least 252 observed finalized daily bars inside that inclusive span. Otherwise it is unavailable. This conservative rule can reject years with fewer sessions. Daily SMA-200 distance = 100 × (latest finalized close / mean of last 200 finalized daily closes − 1); missing history, zero mean or non-finite result is unavailable. The metrics carry their finalized daily date and remain unchanged by range, interval, visibility or theme changes. Per-bar price change on weekly/monthly views is labeled previous-bar change and remains provisional for partial groups.
