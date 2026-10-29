import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { GlassPanel } from '../../components/GlassPanel';
import { groupFailures, loadCloses } from '../../correlation/history';
import type { CloseSeries } from '../../correlation/history';
import {
  constituentsAsOf,
  findMarket,
  markets,
  parseTickers,
} from '../../correlation/markets';
import type { MarketId } from '../../correlation/markets';
import { canvasBlob } from '../../correlation/image';
import {
  downloadBlob,
  downloadText,
  spreadsheetText,
} from '../../import-export/export';
import { requireOnline } from '../../pwa/network';
import { ProviderError } from '../../providers/types';
import { drawPerformance } from '../../performance/image';
import { benchmarkColor, lineColors } from '../../performance/layout';
import {
  benchmarks,
  comparePerformance,
  formatChange,
  maxStocks,
  PerformanceHistoryError,
  performanceLookbackDays,
  performancePeriods,
  periodNames,
} from '../../performance/performance';
import type {
  PerformancePeriod,
  PerformanceResult,
} from '../../performance/performance';
import { PerformanceChart } from './PerformanceChart';

interface Loaded {
  market: string;
  industry: string;
  stocks: CloseSeries[];
  /** The index line's history, unless it failed or is one of the stocks. */
  index: CloseSeries | null;
  benchmark: { ticker: string; name: string };
  generatedAt: Date;
}
const footer = (loaded: Loaded) =>
  `Data: Yahoo Finance (unofficial) · Generated ${new Intl.DateTimeFormat(
    'en-GB',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    },
  ).format(
    loaded.generatedAt,
  )} · Past performance does not predict future results`;

export function PerformancePage({
  onBack,
  dark = false,
}: {
  onBack: () => void;
  dark?: boolean;
}) {
  const [marketId, setMarketId] = useState<MarketId>('sp500');
  const market = findMarket(marketId);
  const [industryId, setIndustryId] = useState('all');
  const industry =
    market.industries.find((item) => item.id === industryId) ??
    market.industries[0]!;
  const [count, setCount] = useState<5 | 8>(5);
  const [period, setPeriod] = useState<PerformancePeriod>('3M');
  const [showIndex, setShowIndex] = useState(true);
  const preset = industry.symbols.slice(0, count).join(', ');
  const [tickerText, setTickerText] = useState(preset);
  const [presetKey, setPresetKey] = useState(preset);
  if (preset !== presetKey) {
    setPresetKey(preset);
    setTickerText(preset);
  }
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [failures, setFailures] = useState<
    { ticker: string; message: string }[]
  >([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  // Period and index-line changes reuse the loaded history; nothing is fetched.
  const computed = useMemo((): {
    result: PerformanceResult | null;
    problem: string;
  } => {
    if (!loaded) return { result: null, problem: '' };
    const index = showIndex ? loaded.index : null;
    try {
      return {
        result: comparePerformance(
          [...loaded.stocks, ...(index ? [index] : [])],
          period,
          index?.symbol ?? null,
        ),
        problem: '',
      };
    } catch (failure) {
      return {
        result: null,
        problem:
          failure instanceof PerformanceHistoryError
            ? failure.message
            : 'The comparison could not be calculated.',
      };
    }
  }, [loaded, period, showIndex]);
  const result = computed.result;

  async function load() {
    const { tickers, invalid } = parseTickers(market, tickerText);
    setError('');
    setFailures([]);
    setImageStatus('');
    if (invalid.length) {
      setError(
        `Not a valid ${market.name} ticker: ${invalid.join(', ')}. Use symbols such as ${market.industries[0]!.symbols.slice(0, 2).join(', ')}.`,
      );
      return;
    }
    if (tickers.length < 1 || tickers.length > maxStocks) {
      setError(`Choose between 1 and ${maxStocks} stocks.`);
      return;
    }
    try {
      requireOnline();
    } catch (offline) {
      setError(offline instanceof Error ? offline.message : 'You are offline.');
      return;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const benchmark = benchmarks[market.id];
    const requested = [
      ...tickers,
      ...(tickers.includes(benchmark.ticker) ? [] : [benchmark.ticker]),
    ];
    setBusy(true);
    setStatus(`Loading 0 of ${requested.length}…`);
    try {
      const response = await loadCloses(
        market,
        requested,
        current.signal,
        (done, total) => setStatus(`Loading ${done} of ${total}…`),
        { lookback: performanceLookbackDays },
      );
      setFailures(response.failures);
      const stocks = response.series.filter((item) =>
        tickers.includes(item.symbol),
      );
      if (!stocks.length) {
        setLoaded(null);
        setStatus('');
        setError('No stock loaded, so there is nothing to compare.');
        return;
      }
      setHighlight(null);
      setLoaded({
        market: market.name,
        industry: industry.name,
        stocks,
        index: tickers.includes(benchmark.ticker)
          ? null
          : (response.series.find((item) => item.symbol === benchmark.ticker) ??
            null),
        benchmark,
        generatedAt: new Date(),
      });
      setStatus(`Loaded ${stocks.length} of ${tickers.length} stocks.`);
    } catch (failure) {
      if (failure instanceof ProviderError && failure.category === 'cancelled')
        return;
      setStatus('');
      setError(
        failure instanceof ProviderError
          ? failure.message
          : 'The prices could not be loaded.',
      );
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setStatus('Request cancelled. The previous chart is retained.');
  }

  const title = (data: Loaded) => `${data.market} · ${data.industry}`;
  const subtitle = (data: PerformanceResult, info: Loaded) =>
    `% change over ${periodNames[data.period]}, ${data.dates[0]} – ${data.dates.at(-1)}${data.benchmark ? `; dashed line: ${info.benchmark.name}` : ''}`;
  const imageName = (data: PerformanceResult) =>
    `flipchart-performance-${data.period.toLowerCase()}-${data.dates.at(-1)}`;
  const renderImage = (data: PerformanceResult, info: Loaded) =>
    drawPerformance(
      {
        title: title(info),
        subtitle: subtitle(data, info),
        footer: footer(info),
        result: data,
      },
      2,
      getComputedStyle(document.body).fontFamily,
    );

  /** Browsers only put PNG on the clipboard; it pastes like any picture. */
  async function copyImage() {
    if (!result || !loaded) return;
    const png = canvasBlob(renderImage(result, loaded), 'image/png');
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
        throw new Error('Image clipboard unsupported');
      // Pass the pending blob so Safari keeps the click's permission.
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png }),
      ]);
      setImageStatus(
        'Chart image copied. Paste it into Docs, Slides, email or chat.',
      );
    } catch {
      downloadBlob(await png, `${imageName(result)}.png`);
      setImageStatus(
        'This browser did not allow copying images, so the image was downloaded as PNG instead.',
      );
    }
  }

  async function downloadJpg() {
    if (!result || !loaded) return;
    downloadBlob(
      await canvasBlob(renderImage(result, loaded), 'image/jpeg'),
      `${imageName(result)}.jpg`,
    );
    setImageStatus('Chart image downloaded as JPG.');
  }

  function exportCsv() {
    if (!result) return;
    const lines = [
      ...result.stocks,
      ...(result.benchmark ? [result.benchmark] : []),
    ];
    const csv = Papa.unparse(
      {
        fields: [
          'date',
          ...lines.map((line) =>
            spreadsheetText(
              `${line.symbol}${line === result.benchmark ? ' (index)' : ''} change_pct`,
            ),
          ),
        ],
        data: result.dates.map((date, index) => [
          date,
          ...lines.map((line) => line.changes[index]),
        ]),
      },
      { newline: '\r\n' },
    );
    downloadText(csv, `${imageName(result)}.csv`, 'text/csv;charset=utf-8');
  }

  const colors = lineColors[dark ? 'dark' : 'light'];
  const ranked = result
    ? result.stocks
        .map((line, index) => ({ line, color: colors[index % colors.length]! }))
        .sort((a, b) => b.line.total - a.line.total)
    : [];
  return (
    <GlassPanel
      className="correlation-page performance-page"
      aria-labelledby="performance-title"
    >
      <div className="panel-heading">
        <div>
          <span className="badge">YAHOO FINANCE · UNOFFICIAL</span>
          <h2 id="performance-title">Performance comparison</h2>
          <p className="small">
            How several stocks did from the same starting point, next to their
            index. Data is fetched only when you choose Load and is kept for
            this session.
          </p>
        </div>
        <button onClick={onBack}>Back to chart</button>
      </div>
      <form
        className="correlation-controls"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          Market
          <select
            aria-label="Market"
            value={marketId}
            onChange={(event) => {
              setMarketId(event.target.value as MarketId);
              setIndustryId('all');
            }}
          >
            {markets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Industry
          <select
            aria-label="Industry"
            value={industry.id}
            onChange={(event) => setIndustryId(event.target.value)}
          >
            {market.industries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Stocks</legend>
          <div className="segmented">
            {([5, 8] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={count === value}
                onClick={() => setCount(value)}
              >
                Top {value}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Period</legend>
          <div className="segmented">
            {performancePeriods.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                aria-label={periodNames[value]}
                onClick={() => setPeriod(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="performance-index">
          <input
            type="checkbox"
            checked={showIndex}
            onChange={(event) => setShowIndex(event.target.checked)}
          />
          Show index ({benchmarks[market.id].ticker})
        </label>
        <label className="correlation-tickers">
          Tickers ({market.suffix ? 'NSE symbols' : 'US tickers'}, up to{' '}
          {maxStocks}, editable)
          <input
            aria-label="Tickers"
            value={tickerText}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setTickerText(event.target.value)}
          />
        </label>
        <div className="provider-actions">
          <button className="primary" type="submit" disabled={busy}>
            Load performance
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <p className="small">
        Members are curated by approximate market cap as of {constituentsAsOf}{' '}
        and may be outdated; edit the tickers if needed. Each line is the
        percent change in closing price from the first day of the period, on
        days every stock traded. Prices are not adjusted for dividends.
        Switching the period does not fetch again.
      </p>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
      {(error || computed.problem) && (
        <div className="notice" role="alert">
          {error || computed.problem}
        </div>
      )}
      {failures.length > 0 && (
        <div className="notice" role="status">
          Not loaded and excluded: {groupFailures(failures)}
        </div>
      )}
      {result && result.skipped.length > 0 && (
        <div className="notice" role="status">
          Left out of this period:{' '}
          {result.skipped
            .map((item) => `${item.symbol} (${item.reason})`)
            .join('; ')}
        </div>
      )}
      {result && loaded && (
        <div className="correlation-result">
          <figure
            className="heatmap-card performance-card"
            data-testid="performance-card"
          >
            <div className="heatmap-card-header">
              <p className="heatmap-title">
                <strong>{title(loaded)}</strong>
                <span>{subtitle(result, loaded)}</span>
              </p>
              <p className="heatmap-brand">
                <span className="heatmap-brand-mark" aria-hidden="true">
                  F
                </span>
                <span>
                  Prepared by <strong>FlipChart</strong>
                </span>
              </p>
            </div>
            <PerformanceChart
              result={result}
              dark={dark}
              highlight={highlight}
            />
            <figcaption className="heatmap-footer">{footer(loaded)}</figcaption>
          </figure>
          <div className="provider-actions heatmap-actions">
            <button type="button" onClick={() => void copyImage()}>
              Copy image
            </button>
            <button type="button" onClick={() => void downloadJpg()}>
              Download JPG
            </button>
            <button type="button" onClick={exportCsv}>
              Download CSV
            </button>
          </div>
          {imageStatus && (
            <p className="small" role="status">
              {imageStatus}
            </p>
          )}
          <div className="rotation-scroll">
            <table
              className="rotation-table performance-table"
              data-testid="performance-table"
              onMouseLeave={() => setHighlight(null)}
            >
              <caption className="visually-hidden">
                Return, difference from the index and largest fall over{' '}
                {periodNames[result.period]}, best first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Stock</th>
                  <th scope="col">Return</th>
                  <th scope="col" title="Return minus the index return">
                    vs index
                  </th>
                  <th scope="col" title="Largest fall from a peak">
                    Max drawdown
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ line, color }) => (
                  <tr
                    key={line.symbol}
                    tabIndex={0}
                    onMouseEnter={() => setHighlight(line.symbol)}
                    onFocus={() => setHighlight(line.symbol)}
                    onBlur={() => setHighlight(null)}
                  >
                    <th scope="row">
                      <span
                        className="series-swatch"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      {line.symbol}
                    </th>
                    <td>{formatChange(line.total)}</td>
                    <td>
                      {result.benchmark
                        ? `${formatChange(line.total - result.benchmark.total).replace('%', '')} pts`
                        : '–'}
                    </td>
                    <td>{formatChange(line.maxDrawdown)}</td>
                  </tr>
                ))}
                {result.benchmark && (
                  <tr className="performance-benchmark-row">
                    <th scope="row">
                      <span
                        className="series-swatch dashed"
                        style={{
                          borderColor: benchmarkColor[dark ? 'dark' : 'light'],
                        }}
                        aria-hidden="true"
                      />
                      {loaded.benchmark.name}
                    </th>
                    <td>{formatChange(result.benchmark.total)}</td>
                    <td>–</td>
                    <td>{formatChange(result.benchmark.maxDrawdown)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
