import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { GlassPanel } from '../../components/GlassPanel';
import type { Dataset } from '../../data/types';
import { canvasBlob } from '../../correlation/image';
import { cellColors, legendGradient } from '../../correlation/heatmap';
import type { HeatmapPalette } from '../../correlation/heatmap';
import { downloadBlob, downloadText } from '../../import-export/export';
import { exchangeDate } from '../../providers/twelve-data';
import { drawSeasonality } from '../../seasonality/image';
import {
  colourScale,
  formatReturn,
  formatShare,
  minimumObservations,
  monthlyReturns,
  monthNames,
  SeasonalityError,
} from '../../seasonality/seasonality';
import type { SeasonalityResult } from '../../seasonality/seasonality';

const safeToday = (timezone: string | null) => {
  try {
    return exchangeDate(timezone);
  } catch {
    // A mistyped timezone in an imported file must not break the page.
    return new Date().toISOString().slice(0, 10);
  }
};
const priceBasis: Record<Dataset['metadata']['adjustment'], string> = {
  adjusted: 'adjusted prices',
  raw: 'unadjusted prices',
  synthetic: 'synthetic prices',
  unknown: 'prices as supplied',
};
const footerText = (dataset: Dataset, sourceName: string) =>
  `Data: ${sourceName} · ${priceBasis[dataset.metadata.adjustment]} · Generated ${new Intl.DateTimeFormat(
    'en-GB',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    },
  ).format(new Date())} · For information only, not financial advice`;

export function SeasonalityPanel({
  dataset,
  sourceName,
  palette = 'blue-orange',
}: {
  /** The loaded daily dataset, never the weekly or monthly view of it. */
  dataset: Dataset;
  sourceName: string;
  palette?: HeatmapPalette;
}) {
  const daily = dataset.metadata.interval === 'daily';
  const timezone = dataset.metadata.listing.timezone;
  const outcome = useMemo((): SeasonalityResult | string => {
    if (!daily)
      return 'Monthly returns need daily candles. This dataset is not daily.';
    try {
      return monthlyReturns(dataset.candles, safeToday(timezone));
    } catch (failure) {
      if (failure instanceof SeasonalityError) return failure.message;
      throw failure;
    }
  }, [dataset, daily, timezone]);
  const [imageStatus, setImageStatus] = useState('');
  const symbol = dataset.metadata.listing.symbol;
  const result = typeof outcome === 'string' ? null : outcome;
  const scale = useMemo(() => (result ? colourScale(result) : 5), [result]);
  const rows = useMemo(
    () => (result ? [...result.years].reverse() : []),
    [result],
  );

  const title = `${symbol} · Monthly returns`;
  const subtitle = result
    ? `% change from the previous month's last close · ${result.from} – ${result.to}`
    : '';
  const imageName = result
    ? `flipchart-${symbol.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'dataset'}-monthly-returns-${result.to}`
    : '';
  const renderImage = (loaded: SeasonalityResult) =>
    drawSeasonality(
      {
        title,
        subtitle,
        footer: footerText(dataset, sourceName),
        result: loaded,
        scale,
        palette,
      },
      2,
      getComputedStyle(document.body).fontFamily,
    );

  /** Browsers only put PNG on the clipboard; it pastes like any picture. */
  async function copyImage() {
    if (!result) return;
    const png = canvasBlob(renderImage(result), 'image/png');
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
        throw new Error('Image clipboard unsupported');
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png }),
      ]);
      setImageStatus(
        'Monthly returns image copied. Paste it into Docs, Slides, email or chat.',
      );
    } catch {
      downloadBlob(await png, `${imageName}.png`);
      setImageStatus(
        'This browser did not allow copying images, so the image was downloaded as PNG instead.',
      );
    }
  }
  async function downloadJpg() {
    if (!result) return;
    downloadBlob(
      await canvasBlob(renderImage(result), 'image/jpeg'),
      `${imageName}.jpg`,
    );
    setImageStatus('Monthly returns image downloaded as JPG.');
  }
  function exportCsv() {
    if (!result) return;
    const round = (value: number | null) =>
      value === null ? '' : Number(value.toFixed(4));
    const csv = Papa.unparse(
      {
        fields: ['Year', ...monthNames, 'Year change %', 'Note'],
        data: [
          ...rows.map((entry) => {
            const open = entry.months
              .map((month, index) => (month.partial ? monthNames[index] : null))
              .filter(Boolean);
            return [
              entry.year,
              ...entry.months.map((month) => round(month.value)),
              round(entry.total),
              [
                open.length ? `in progress: ${open.join(', ')}` : '',
                entry.partial && !open.length ? 'year to date' : '',
              ]
                .filter(Boolean)
                .join('; '),
            ];
          }),
          [
            'Average',
            ...result.statistics.map((stat) => round(stat.average)),
            '',
            'complete months only',
          ],
          [
            'Up months %',
            ...result.statistics.map((stat) => round(stat.upShare)),
            '',
            'complete months only',
          ],
        ],
      },
      { newline: '\r\n' },
    );
    downloadText(csv, `${imageName}.csv`, 'text/csv;charset=utf-8');
  }

  return (
    <GlassPanel
      className="seasonality-panel"
      aria-labelledby="seasonality-title"
    >
      <div className="panel-heading">
        <div>
          <h2 id="seasonality-title">Monthly returns</h2>
          <p className="small">
            Which calendar months this stock has tended to rise or fall in. Each
            cell is the month&apos;s change from the previous month&apos;s last
            close. Calculated from the loaded daily history; nothing more is
            fetched.
          </p>
        </div>
      </div>
      {!result && (
        <p className="small" role="status">
          {outcome as string}
        </p>
      )}
      {result && (
        <>
          <figure
            className="heatmap-card seasonality-card"
            data-testid="seasonality-card"
          >
            <div className="heatmap-card-header">
              <p className="heatmap-title">
                <strong>{title}</strong>
                <span>{subtitle}</span>
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
              <table
                className="seasonality-table"
                data-testid="seasonality-table"
              >
                <caption className="visually-hidden">
                  {title}: percent change of each calendar month from the
                  previous month&apos;s last close, newest year first, with the
                  average and share of up months for each month of the year.
                </caption>
                <thead>
                  <tr>
                    <td />
                    {monthNames.map((name) => (
                      <th key={name} scope="col">
                        {name}
                      </th>
                    ))}
                    <th scope="col" className="seasonality-year-column">
                      Year
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.year}>
                      <th scope="row">{entry.year}</th>
                      {entry.months.map((month, index) => (
                        <td
                          key={monthNames[index]}
                          className={month.partial ? 'in-progress' : undefined}
                          style={cellColors(
                            month.value === null
                              ? null
                              : Math.max(-1, Math.min(1, month.value / scale)),
                            palette,
                          )}
                          title={`${monthNames[index]} ${entry.year}: ${
                            month.value === null
                              ? 'unavailable (no previous month in the data)'
                              : `${month.value > 0 ? '+' : ''}${month.value.toFixed(2)}%${month.partial ? ' so far, month in progress' : ''}`
                          }`}
                        >
                          {formatReturn(month.value)}
                        </td>
                      ))}
                      <td
                        className={`seasonality-year-column${entry.partial && entry.total !== null ? ' in-progress' : ''}`}
                        style={cellColors(
                          entry.total === null
                            ? null
                            : Math.max(-1, Math.min(1, entry.total / scale)),
                          palette,
                        )}
                        title={`${entry.year}: ${
                          entry.total === null
                            ? 'unavailable (needs the previous December close)'
                            : `${entry.total > 0 ? '+' : ''}${entry.total.toFixed(2)}%${entry.partial ? ' so far this year' : ''}`
                        }`}
                      >
                        {formatReturn(entry.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tbody className="seasonality-stats">
                  <tr>
                    <th scope="row">Average</th>
                    {result.statistics.map((stat, index) => (
                      <td
                        key={monthNames[index]}
                        style={cellColors(
                          stat.average === null
                            ? null
                            : Math.max(-1, Math.min(1, stat.average / scale)),
                          palette,
                        )}
                        title={
                          stat.average === null
                            ? `${monthNames[index]}: needs at least ${minimumObservations} complete months (has ${stat.count})`
                            : `${monthNames[index]}: average of ${stat.count} complete months, ${stat.average.toFixed(2)}%`
                        }
                      >
                        {formatReturn(stat.average)}
                      </td>
                    ))}
                    <td className="seasonality-year-column" />
                  </tr>
                  <tr>
                    <th scope="row">Up months</th>
                    {result.statistics.map((stat, index) => (
                      <td
                        key={monthNames[index]}
                        className="plain"
                        title={
                          stat.upShare === null
                            ? `${monthNames[index]}: needs at least ${minimumObservations} complete months (has ${stat.count})`
                            : `${monthNames[index]}: closed up in ${Math.round((stat.upShare * stat.count) / 100)} of ${stat.count} complete months`
                        }
                      >
                        {formatShare(stat.upShare)}
                      </td>
                    ))}
                    <td className="seasonality-year-column" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="heatmap-legend" aria-hidden="true">
              <span>−{scale}%</span>
              <span
                className="heatmap-scale"
                style={{ background: legendGradient(palette) }}
              />
              <span>+{scale}%</span>
            </div>
            <figcaption className="heatmap-footer">
              {rows.some((entry) =>
                entry.months.some((month) => month.partial),
              ) && (
                <span className="seasonality-note">
                  Dashed outline: month still in progress, not counted in
                  Average or Up months.
                </span>
              )}
              {footerText(dataset, sourceName)}
            </figcaption>
          </figure>
          <p className="small">
            Average and Up months use complete months only and need at least{' '}
            {minimumObservations} of them. The first month of the data has no
            previous close, so it is blank. Colours stop getting stronger at ±
            {scale}%. These are price changes, so dividends are not included,
            and a few years of history make each average noisy. Past months do
            not predict future ones.
          </p>
          <div className="provider-actions heatmap-actions">
            <button type="button" onClick={() => void copyImage()}>
              Copy image
            </button>
            <button type="button" onClick={() => void downloadJpg()}>
              Download JPG
            </button>
            <button type="button" onClick={exportCsv}>
              Download monthly CSV
            </button>
          </div>
          {imageStatus && (
            <p className="small" role="status">
              {imageStatus}
            </p>
          )}
        </>
      )}
    </GlassPanel>
  );
}
