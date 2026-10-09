# Data contracts and local import conventions

Implemented in Phase 2, 9 October 2026. The application remains daily-first.

## Normalization and metadata

`Candle.time` is a canonical, valid YYYY-MM-DD daily trading date. Prices must be finite; low ≤ open/close ≤ high. Known volume must be finite and non-negative; unknown volume is `null`, not zero. Bars sort chronologically. Exact duplicate OHLCV/incomplete flags coalesce; conflicting duplicates fail. Missing sessions are retained as gaps.

`validateDataset` validates unknown data and returns a projection of the documented fields, rather than passing arbitrary objects through to storage. Coverage/latest time must match the sorted candles. Listing metadata has explicit nullable facts; currency codes and supplied timezones are validated. IDs/listing IDs are namespaced `demo:`, `import:` or `live:`. Demo data requires synthetic adjustments; live data requires a provider, while local modes cannot claim one. Retrieval times have an explicit offset. Source conventions and incomplete flags accompany the candles.

Imported datasets have a UUID-based identity, historical-import freshness, unknown delay, supplied currency/timezone/adjustment, filename and parsing conventions. No exchange calendar, market freshness, or provider access is inferred. Optional missing name/exchange/MIC are displayed or retained as unavailable. Currency/timezone/symbol are required in the CSV workflow. Unknown adjustment is an explicit declaration. Storage never retains unused CSV fields or raw request URLs/credentials.

## CSV contract

Papa Parse handles quoting, escaped quotes, CR/LF and quoted multiline fields without numeric/date auto-typing. Delimiter and date/number conventions are explicit. Source record numbers include the header and blank records; quoted multiline fields occupy one logical record. Blank records are skipped and at most 20 actionable errors are displayed. Parsing errors, invalid prices, ambiguous dates, bad mapping, missing required metadata or conflicting duplicates prevent the entire import.

Limits and supported formats are documented in the README. Date-only input never undergoes a browser timezone conversion. Explicit-offset ISO timestamps are converted to the user's exchange date; the file must already represent daily bars. Offset-free local timestamps are rejected rather than guessing DST/offsets. Native input remains daily-only; Phase 5 provides labeled local weekly/monthly views after loading. OHLC values are never independently adjusted or repaired.

The import form declares candles finalized by default and lets the user mark the last chronological daily candle incomplete. That flag is preserved through reload and its summary is provisional. Missing volume uses chart whitespace; if all volume is unknown no volume series/pane is created. Future volume-dependent indicators must retain unavailable states for missing inputs.

## Weekly/monthly aggregation helpers

`aggregateDaily` is a pure, validated daily-to-weekly/monthly transform. Weekly groups use Monday–Sunday calendar boundaries; monthly groups use calendar months. The bar label is the calendar period start. Listing currency/timezone and adjustment conventions stay unchanged; dates are grouped as source trading dates, without local-time conversion.

- Open = first available open; high = maximum high; low = minimum low; close = last available close.
- Volume = sum only if every constituent has known volume; otherwise `null`. Legitimate zero stays zero.
- No sessions or empty intervening periods are fabricated.
- Any incomplete input candle or absent weekday conservatively marks the output incomplete/partial. Weekends alone do not mark a period partial. This is a coverage check, not exchange-calendar certification: holidays can be flagged partial because exchange calendars are unverified.
- Provenance includes source coverage, interval, method, group first/last available dates, count and partial flag. The output coverage is the available period labels; source trading-date coverage is preserved separately.

Phase 5 exposes these helpers as labeled local chart interval controls, including source coverage and partial group counts. Calculations exclude partial groups and disclose provisional summaries. Native CSV input remains daily-only; choose a local weekly/monthly view after loading. Independent hand-authored fixture expectations test first/last bars, extrema, known/unknown/zero volume, full weeks, partial months, leap-year months, year boundaries and empty input.

## Provider boundary

`MarketDataProvider` separates listing search from history, exposes interval/adjustment/history capabilities and unknown access, takes an abort signal and memory-only credential, and returns normalized candles with metadata. Typed errors cover missing/invalid keys, quota, unsupported listing/interval/endpoint, insufficient history, empty/malformed responses, network/CORS, outage and cancellation. No adapter or live access is implemented in Phase 2.

## Versioned persistence

IndexedDB database/schema version 1 stores one atomic library envelope with normalized datasets and selected ID. LocalStorage separately stores version 1 appearance and chart view/range preferences. Phase 1 appearance preferences are retained. Unknown/incompatible versions are not blindly applied; unsupported library versions remain untouched and the app uses memory defaults. Invalid saved datasets are skipped with feedback. Future migrations must explicitly validate older versions.

Reads/writes have bounded waits; connections close after transaction completion/abort and on version changes. Commands serialize to preserve ordering and prevent lost updates. Retention is bounded by dataset count, total candles and normalized serialized payload; oldest entries are evicted. Denied or quota-failed storage switches to session-only state without making false durable-save/delete claims. Only demo/import are permitted in this library until provider caching terms are verified.

Current source references checked on 9 October 2026: [Papa Parse documentation](https://www.papaparse.com/docs), [MDN IndexedDB usage](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB). Actual library versions are recorded in the lockfile.

## Phase 6 native data, preferences and export

Listings may include an optional `region`; it is projected/validated text and is never represented as exchange/MIC. Alpha Vantage search retains its native symbol and currency, while exchange/MIC/timezone remain null until the documented history timezone arrives. Native weekly/monthly timestamps are last trading dates; local aggregation still uses period-start labels and explicit provenance.

`flipchart:dashboard` version 2 stores only validated parameters, visibility, collapsed cards and the expanded card ID. Visibility-only version 1 migrates with default calculations/layout; unknown/corrupt shapes fall back. Existing version 1 chart-style/range preferences remain compatible in their separate workspace key. `flipchart:watchlist` version 1 projects at most 30 validated provider/listing pairs; no candles, credentials or envelopes. Per-provider remembered keys use isolated credential keys.

CSV exports are header-first UTF-8/CRLF files with proper quoted fields. Numeric OHLCV and all named indicator columns retain full numeric precision; null is an empty cell. Every row carries source/listing/interval/adjustment/retrieval/parameter/aggregation fields. Text starting with spreadsheet formula markers (including leading whitespace) receives an apostrophe; numeric values remain numeric. Companion JSON supplies full projected metadata and conventions. Calculations use the active full interval dataset, then optional logical chart-window bounds select rows by ceil(from)/floor(to); this includes current pan/zoom rather than only the range button. Hidden indicators are exported too. Imported filenames stay in JSON provenance, not spreadsheet cells. Provisional candles retain OHLCV with aligned null calculation values.
