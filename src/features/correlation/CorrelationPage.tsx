import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { GlassPanel } from '../../components/GlassPanel';
import {
  correlationMatrix,
  InsufficientHistoryError,
} from '../../correlation/correlation';
import type {
  Basis,
  CorrelationResult,
  Period,
} from '../../correlation/correlation';
import { loadCloses } from '../../correlation/history';
import {
  constituentsAsOf,
  findMarket,
  markets,
  parseTickers,
} from '../../correlation/markets';
import type { MarketId } from '../../correlation/markets';
import {
  downloadBlob,
  downloadText,
  spreadsheetText,
} from '../../import-export/export';
import { canvasBlob, drawHeatmap } from '../../correlation/image';
import { requireOnline } from '../../pwa/network';
import { ProviderError } from '../../providers/types';
import { cellColors, formatCorrelation } from '../../correlation/heatmap';

type Loaded = CorrelationResult & {
  market: string;
  industry: string;
  generatedAt: Date;
};
const subtitle = (result: Loaded) =>
  `Pearson correlation of ${result.basis === 'returns' ? 'daily returns' : 'closing prices'}, ${result.period} trading days (${result.dates[0]} – ${result.dates.at(-1)})`;
const footer = (result: Loaded) =>
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
  ).format(result.generatedAt)} · For information only, not financial advice`;

export function CorrelationPage({ onBack }: { onBack: () => void }) {
  const [marketId, setMarketId] = useState<MarketId>('sp500');
  const market = findMarket(marketId);
  const [industryId, setIndustryId] = useState('all');
  const industry =
    market.industries.find((item) => item.id === industryId) ??
    market.industries[0]!;
  const [count, setCount] = useState<5 | 10>(10);
  const [period, setPeriod] = useState<Period>(30);
  const [basis, setBasis] = useState<Basis>('returns');
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
  const [result, setResult] = useState<Loaded | null>(null);
  const [imageStatus, setImageStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

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
    if (tickers.length < 2 || tickers.length > 10) {
      setError('Choose between 2 and 10 stocks.');
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
    setBusy(true);
    setStatus(`Loading 0 of ${tickers.length} stocks…`);
    try {
      const loaded = await loadCloses(
        market,
        tickers,
        current.signal,
        (done, total) => setStatus(`Loading ${done} of ${total} stocks…`),
      );
      setFailures(loaded.failures);
      if (loaded.series.length < 2) {
        setResult(null);
        setStatus('');
        setError('Fewer than two stocks loaded, so no correlation is shown.');
        return;
      }
      const matrix = correlationMatrix(loaded.series, period, basis);
      setResult({
        ...matrix,
        market: market.name,
        industry: industry.name,
        generatedAt: new Date(),
      });
      setStatus(
        `Showing ${matrix.symbols.length} stocks over ${matrix.observations} ${basis === 'returns' ? 'daily returns' : 'closes'}, ${matrix.dates[0]} – ${matrix.dates.at(-1)}.`,
      );
    } catch (failure) {
      if (failure instanceof ProviderError && failure.category === 'cancelled')
        return;
      setResult(null);
      setStatus('');
      setError(
        failure instanceof InsufficientHistoryError ||
          failure instanceof ProviderError
          ? failure.message
          : 'The correlation could not be calculated.',
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
    setStatus('Request cancelled. The previous heatmap is retained.');
  }

  function renderImage(loaded: Loaded) {
    return drawHeatmap(
      {
        title: `${loaded.market} · ${loaded.industry}`,
        subtitle: subtitle(loaded),
        footer: footer(loaded),
        symbols: loaded.symbols,
        matrix: loaded.matrix,
      },
      2,
      getComputedStyle(document.body).fontFamily,
    );
  }
  const imageName = (loaded: Loaded) =>
    `flipchart-correlation-${loaded.basis}-${loaded.period}d-${loaded.dates.at(-1)}`;

  /** Browsers only put PNG on the clipboard; it pastes like any picture. */
  async function copyImage() {
    if (!result) return;
    const canvas = renderImage(result);
    const png = canvasBlob(canvas, 'image/png');
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
        throw new Error('Image clipboard unsupported');
      // Pass the pending blob so Safari keeps the click's permission.
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png }),
      ]);
      setImageStatus(
        'Heatmap image copied. Paste it into Docs, Slides, email or chat.',
      );
    } catch {
      downloadBlob(await png, `${imageName(result)}.png`);
      setImageStatus(
        'This browser did not allow copying images, so the image was downloaded as PNG instead.',
      );
    }
  }

  async function downloadJpg() {
    if (!result) return;
    downloadBlob(
      await canvasBlob(renderImage(result), 'image/jpeg'),
      `${imageName(result)}.jpg`,
    );
    setImageStatus('Heatmap image downloaded as JPG.');
  }

  function exportCsv() {
    if (!result) return;
    const csv = Papa.unparse(
      {
        fields: ['symbol', ...result.symbols.map(spreadsheetText)],
        data: result.matrix.map((row, i) => [
          spreadsheetText(result.symbols[i]),
          ...row,
        ]),
      },
      { newline: '\r\n' },
    );
    downloadText(
      csv,
      `flipchart-correlation-${result.basis}-${result.period}d-${result.dates.at(-1)}.csv`,
      'text/csv;charset=utf-8',
    );
  }

  return (
    <GlassPanel
      className="correlation-page"
      aria-labelledby="correlation-title"
    >
      <div className="panel-heading">
        <div>
          <span className="badge">YAHOO FINANCE · UNOFFICIAL</span>
          <h2 id="correlation-title">Correlation heatmap</h2>
          <p className="small">
            How closely the largest stocks in an industry moved together. Data
            is fetched only when you choose Load and is kept for this session.
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
            {([5, 10] as const).map((value) => (
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
          <legend>Period (trading days)</legend>
          <div className="segmented">
            {([15, 30] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {value} days
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Correlate</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={basis === 'returns'}
              onClick={() => setBasis('returns')}
            >
              Daily returns
            </button>
            <button
              type="button"
              aria-pressed={basis === 'prices'}
              onClick={() => setBasis('prices')}
            >
              Prices
            </button>
          </div>
        </fieldset>
        <label className="correlation-tickers">
          Tickers ({market.suffix ? 'NSE symbols' : 'US tickers'}, editable)
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
            Load correlation
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <p className="small">
        {industry.symbols.length < count
          ? `${industry.name} has ${industry.symbols.length} members in this list, so all are used. `
          : ''}
        Members are curated by approximate market cap as of {constituentsAsOf}{' '}
        and may be outdated; edit the tickers if needed.{' '}
        {basis === 'returns'
          ? 'Daily returns (close ÷ previous close − 1) show whether stocks move together day to day.'
          : 'Price correlation is shown for comparison; shared trends make it read high even for unrelated stocks.'}{' '}
        Only sessions every stock traded are used. With 15 or 30 observations,
        individual values are noisy.
      </p>
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {failures.length > 0 && (
        <div className="notice" role="status">
          Not loaded and excluded:{' '}
          {failures
            .map((failure) => `${failure.ticker} (${failure.message})`)
            .join('; ')}
        </div>
      )}
      {result && (
        <div className="correlation-result">
          {/* A self-contained, branded card so a screenshot carries its provenance. */}
          <figure className="heatmap-card" data-testid="heatmap-card">
            <div className="heatmap-card-header">
              <p className="heatmap-title">
                <strong>
                  {result.market} · {result.industry}
                </strong>
                <span>
                  Pearson correlation of{' '}
                  {result.basis === 'returns'
                    ? 'daily returns'
                    : 'closing prices'}
                  , {result.period} trading days{' '}
                  <span className="heatmap-range">
                    ({result.dates[0]} – {result.dates.at(-1)})
                  </span>
                </span>
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
            <div className="heatmap-scroll">
              <table className="heatmap" data-testid="correlation-heatmap">
                <caption className="visually-hidden">
                  {result.market} · {result.industry}: Pearson correlation of{' '}
                  {result.basis === 'returns'
                    ? 'daily returns'
                    : 'closing prices'}
                  , {result.period} trading days ({result.dates[0]} –{' '}
                  {result.dates.at(-1)})
                </caption>
                <thead>
                  <tr>
                    <td />
                    {result.symbols.map((symbol) => (
                      <th key={symbol} scope="col">
                        {symbol}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.matrix.map((row, i) => (
                    <tr key={result.symbols[i]}>
                      <th scope="row">{result.symbols[i]}</th>
                      {row.map((value, j) => (
                        <td
                          key={result.symbols[j]}
                          style={cellColors(value)}
                          title={`${result.symbols[i]} · ${result.symbols[j]}: ${value === null ? 'unavailable (no price movement)' : value.toFixed(4)}`}
                        >
                          {formatCorrelation(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="heatmap-legend" aria-hidden="true">
              <span>−1</span>
              <span className="heatmap-scale" />
              <span>+1</span>
            </div>
            <figcaption className="heatmap-footer">{footer(result)}</figcaption>
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
        </div>
      )}
    </GlassPanel>
  );
}
