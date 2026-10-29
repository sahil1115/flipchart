import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import { GlassPanel } from '../../components/GlassPanel';
import { groupFailures, loadCloses } from '../../correlation/history';
import {
  downloadBlob,
  downloadText,
  spreadsheetText,
} from '../../import-export/export';
import { requireOnline } from '../../pwa/network';
import { exchangeDate } from '../../providers/twelve-data';
import { ProviderError } from '../../providers/types';
import { canvasBlob } from '../../correlation/image';
import { drawRotation } from '../../rotation/image';
import { formatReading, quadrantInfo } from '../../rotation/layout';
import {
  buildRotation,
  momentumWeeks,
  quadrantOf,
  RotationHistoryError,
  rotationLookbackDays,
  tailPoints,
  trendWeeks,
} from '../../rotation/rotation';
import type { RotationResult } from '../../rotation/rotation';
import { findMarket } from '../../correlation/markets';
import { findUniverse, rotationUniverses } from '../../rotation/universes';
import type { RotationUniverseId } from '../../rotation/universes';
import { RotationChart } from './RotationChart';

type Loaded = RotationResult & { generatedAt: Date };
const subtitle = (result: RotationResult) =>
  `Weekly relative strength against ${result.benchmark}; tails show the last ${tailPoints - 1} weeks, latest full week to ${result.asOf}`;
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

export function RotationPage({ onBack }: { onBack: () => void }) {
  const [universeId, setUniverseId] = useState<RotationUniverseId>('us');
  const universe = findUniverse(universeId);
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
    setError('');
    setFailures([]);
    setImageStatus('');
    try {
      requireOnline();
    } catch (offline) {
      setError(offline instanceof Error ? offline.message : 'You are offline.');
      return;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const tickers = [
      universe.benchmark.ticker,
      ...universe.sectors.map((sector) => sector.ticker),
    ];
    setBusy(true);
    setStatus(`Loading 0 of ${tickers.length} funds…`);
    try {
      const loaded = await loadCloses(
        findMarket(universe.marketId),
        tickers,
        current.signal,
        (done, total) => setStatus(`Loading ${done} of ${total} funds…`),
        { lookback: rotationLookbackDays },
      );
      setFailures(loaded.failures);
      const rotation = buildRotation(
        universe,
        loaded.series,
        exchangeDate(findMarket(universe.marketId).timezone),
      );
      setResult({ ...rotation, generatedAt: new Date() });
      setStatus(
        `Showing ${rotation.sectors.length} sectors, weekly, latest full week to ${rotation.asOf}.`,
      );
    } catch (failure) {
      if (failure instanceof ProviderError && failure.category === 'cancelled')
        return;
      setResult(null);
      setStatus('');
      setError(
        failure instanceof RotationHistoryError ||
          failure instanceof ProviderError
          ? failure.message
          : 'The sector rotation could not be calculated.',
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

  const renderImage = (loaded: Loaded) =>
    drawRotation(
      {
        title: `Sector rotation · ${loaded.universe}`,
        subtitle: subtitle(loaded),
        footer: footer(loaded),
        result: loaded,
      },
      2,
      getComputedStyle(document.body).fontFamily,
    );
  const imageName = (loaded: Loaded) =>
    `flipchart-sector-rotation-${loaded.benchmark
      .split(' ')[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')}-${loaded.asOf}`;

  /** Browsers only put PNG on the clipboard; it pastes like any picture. */
  async function copyImage() {
    if (!result) return;
    const png = canvasBlob(renderImage(result), 'image/png');
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
    if (!result) return;
    downloadBlob(
      await canvasBlob(renderImage(result), 'image/jpeg'),
      `${imageName(result)}.jpg`,
    );
    setImageStatus('Chart image downloaded as JPG.');
  }

  function exportCsv() {
    if (!result) return;
    const csv = Papa.unparse(
      {
        fields: [
          'sector',
          'ticker',
          'week_ending',
          'rs_ratio',
          'rs_momentum',
          'quadrant',
        ],
        data: result.sectors.flatMap((sector) =>
          sector.points.map((point) => [
            spreadsheetText(sector.name),
            spreadsheetText(sector.ticker),
            point.week,
            point.ratio,
            point.momentum,
            quadrantInfo[quadrantOf(point.ratio, point.momentum)].name,
          ]),
        ),
      },
      { newline: '\r\n' },
    );
    downloadText(csv, `${imageName(result)}.csv`, 'text/csv;charset=utf-8');
  }

  const ranked = result
    ? [...result.sectors].sort(
        (a, b) => b.points.at(-1)!.ratio - a.points.at(-1)!.ratio,
      )
    : [];
  return (
    <GlassPanel
      className="correlation-page rotation-page"
      aria-labelledby="rotation-title"
    >
      <div className="panel-heading">
        <div>
          <span className="badge">YAHOO FINANCE · UNOFFICIAL</span>
          <h2 id="rotation-title">Sector rotation</h2>
          <p className="small">
            Which sectors are beating the market, and is that getting stronger
            or weaker? Data is fetched only when you choose Load and is kept for
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
            value={universeId}
            onChange={(event) =>
              setUniverseId(event.target.value as RotationUniverseId)
            }
          >
            {rotationUniverses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="provider-actions">
          <button className="primary" type="submit" disabled={busy}>
            Load rotation
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <p className="small">
        {universe.note} Weekly bars use completed weeks only, so the newest
        reading is the last full week.
      </p>
      <details className="rotation-help">
        <summary>How to read this chart</summary>
        <div className="small">
          <p>
            Each dot is a sector fund compared with the benchmark. Right of the
            centre line it is beating the benchmark; above it that
            outperformance is getting stronger. The tail shows the last{' '}
            {tailPoints - 1} weeks, so you can see direction. Sectors often
            rotate clockwise: Improving → Leading → Weakening → Lagging, but
            that is a tendency, not a rule.
          </p>
          <p>
            RS-Ratio is the sector ÷ benchmark price ratio divided by its own{' '}
            {trendWeeks}-week average, so 100 is its recent norm. RS-Momentum is
            how much RS-Ratio changed over {momentumWeeks} weeks, also centred
            on 100. This is an openly described measure, not the proprietary
            Relative Rotation Graph calculation, so values will not match other
            tools. It describes recent relative performance; it does not
            predict.
          </p>
        </div>
      </details>
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
          Not loaded and excluded: {groupFailures(failures)}
        </div>
      )}
      {result && result.skipped.length > 0 && (
        <div className="notice" role="status">
          Left out:{' '}
          {result.skipped
            .map((item) => `${item.label} (${item.reason})`)
            .join('; ')}
        </div>
      )}
      {result && (
        <div className="correlation-result">
          <figure
            className="heatmap-card rotation-card"
            data-testid="rotation-card"
          >
            <div className="heatmap-card-header">
              <p className="heatmap-title">
                <strong>Sector rotation · {result.universe}</strong>
                <span>{subtitle(result)}</span>
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
            <RotationChart result={result} />
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
          <div className="rotation-scroll">
            <table className="rotation-table" data-testid="rotation-table">
              <caption className="visually-hidden">
                Latest weekly RS-Ratio and RS-Momentum by sector, strongest
                relative trend first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sector</th>
                  <th scope="col">Quadrant</th>
                  <th scope="col" title="RS-Ratio">
                    Ratio
                  </th>
                  <th scope="col" title="RS-Momentum">
                    Momentum
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((sector) => {
                  const last = sector.points.at(-1)!;
                  const info = quadrantInfo[sector.quadrant];
                  return (
                    <tr key={sector.ticker}>
                      <th scope="row">
                        {sector.name}{' '}
                        <span className="small">{sector.ticker}</span>
                      </th>
                      <td>
                        <span
                          className="quadrant-chip"
                          style={{ ['--quadrant' as string]: info.color }}
                          title={info.hint}
                        >
                          {info.name}
                        </span>
                      </td>
                      <td>{formatReading(last.ratio)}</td>
                      <td>{formatReading(last.momentum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
