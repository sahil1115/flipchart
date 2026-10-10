import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassPanel } from '../../components/GlassPanel';
import { PriceChart } from '../../charts/PriceChart';
import type { Dataset, TradingDate } from '../../data/types';
import type { Parameters } from '../../indicators/core';
import type { IndicatorId, Visibility } from '../../indicators/presentation';
import { calculateDataset } from '../../indicators/core';
import { definitions } from '../../indicators/presentation';
import { IndicatorControls } from './IndicatorControls';
import { IndicatorCard } from './IndicatorCard';
import { useWorkspace } from '../../state/workspace';
import type { ChartStyle, DisplayRange } from '../../state/workspace';
import type { ThemeDefinition } from '../../themes/themes';
import { exchangeDate } from '../../providers/twelve-data';
import { aggregateDaily } from '../../data/aggregate';
import { useDashboard } from '../../state/dashboard';
import { exportDataset, downloadText } from '../../import-export/export';
import type { ExportWindow } from '../../import-export/export';
import { dailySummary } from '../../indicators/summary';
import { formatValue, paneLabels } from './readout';

export function DatasetWorkspace({
  dataset: sourceDataset,
  theme,
  onChangeData,
  onHistoryRequirement,
}: {
  dataset: Dataset;
  theme: ThemeDefinition;
  onChangeData: () => void;
  onHistoryRequirement?: (bars: number, nativeBars: number) => void;
}) {
  const {
    chartStyle,
    range,
    resetRevision,
    setChartStyle,
    setRange,
    resetChart,
  } = useWorkspace();
  const {
    parameters,
    visible,
    collapsed,
    expanded,
    activePane: selectedPane,
    saved,
    update,
    reset,
  } = useDashboard();
  const setParameters = (parameters: Parameters) => update({ parameters });
  const setVisible = (visible: Visibility) => update({ visible });
  const exportWindow = useRef<ExportWindow | null>(null);
  const [exportScope, setExportScope] = useState<'full' | 'visible'>('full');
  const [exportStatus, setExportStatus] = useState('');
  const updateWindow = useCallback((window: ExportWindow | null) => {
    exportWindow.current = window;
  }, []);
  const activePane = visible[selectedPane]
    ? selectedPane
    : (Object.keys(paneLabels).find((id) => visible[id as IndicatorId]) as
        IndicatorId | undefined);
  const choosePane = (id: IndicatorId) =>
    update({ activePane: id, visible: { ...visible, [id]: true } });
  const [requestedInterval, setInterval] =
    useState<Dataset['metadata']['interval']>('daily');
  const interval =
    sourceDataset.metadata.interval === 'daily'
      ? requestedInterval
      : sourceDataset.metadata.interval;
  const dataset = useMemo(
    () =>
      interval === sourceDataset.metadata.interval
        ? sourceDataset
        : aggregateDaily(sourceDataset, interval as 'weekly' | 'monthly'),
    [sourceDataset, interval],
  );
  const summary = useMemo(() => dailySummary(sourceDataset), [sourceDataset]);
  useEffect(
    () =>
      onHistoryRequirement?.(
        (Math.max(
          parameters.smaLong,
          parameters.emaSlow,
          parameters.bbPeriod,
          parameters.rsiPeriod + 1,
          parameters.atrPeriod + 1,
          parameters.macdSlow + parameters.macdSignal - 1,
          parameters.volumePeriod,
          parameters.stochasticPeriod +
            parameters.stochasticK +
            parameters.stochasticD -
            2,
          2 * parameters.adxPeriod,
          parameters.cciPeriod,
          parameters.williamsPeriod,
          parameters.rocPeriod + 1,
          parameters.volatilityPeriod + 1,
        ) +
          300) *
          (interval === 'weekly' ? 5 : interval === 'monthly' ? 23 : 1),
        Math.max(
          ...Object.entries(parameters)
            .filter(([key]) => key !== 'bbDeviation')
            .map(([, value]) => value),
          parameters.macdSlow + parameters.macdSignal - 1,
          parameters.stochasticPeriod +
            parameters.stochasticK +
            parameters.stochasticD -
            2,
          2 * parameters.adxPeriod,
        ) + 300,
      ),
    [parameters, interval, onHistoryRequirement],
  );
  const [cursorSelection, setCursorSelection] = useState<{
    id: string;
    time: TradingDate | null;
  } | null>(null);
  const cursor =
    cursorSelection?.id ===
    `${dataset.metadata.id}:${dataset.metadata.revision}:${interval}:${resetRevision}`
      ? cursorSelection.time
      : null;
  const updateCursor = useCallback(
    (time: TradingDate | null) =>
      setCursorSelection((previous) =>
        previous?.id ===
          `${dataset.metadata.id}:${dataset.metadata.revision}:${interval}:${resetRevision}` &&
        previous.time === time
          ? previous
          : {
              id: `${dataset.metadata.id}:${dataset.metadata.revision}:${interval}:${resetRevision}`,
              time,
            },
      ),
    [dataset.metadata.id, dataset.metadata.revision, interval, resetRevision],
  );
  const outputs = useMemo(
    () => calculateDataset(dataset, parameters),
    [dataset, parameters],
  );
  const items = useMemo(
    () => definitions(outputs, parameters, interval),
    [outputs, parameters, interval],
  );
  const latest = dataset.candles.at(-1);
  const previous = dataset.candles.at(-2);
  if (!latest)
    return (
      <GlassPanel className="state-panel" role="status">
        <h2>No candles available</h2>
        <p>This dataset is empty. Choose a dataset or load a CSV file.</p>
        <button onClick={onChangeData}>Change data</button>
      </GlassPanel>
    );
  const metadata = dataset.metadata;
  const inspectedBar = cursor
    ? (dataset.candles.find((bar) => bar.time === cursor) ?? latest)
    : latest;
  const listing = metadata.listing;
  const demo = metadata.mode === 'demo';
  const live = metadata.mode === 'live';
  const stale =
    live &&
    (metadata.freshness === 'stale' ||
      exchangeDate(listing.timezone, new Date(metadata.retrievedAt)) !==
        exchangeDate(listing.timezone));
  const change = previous ? latest.close - previous.close : null;
  const percent =
    change !== null && previous && previous.close !== 0
      ? (change / previous.close) * 100
      : null;
  const money = (value: number) =>
    listing.currency
      ? value.toLocaleString('en-US', {
          style: 'currency',
          currency: listing.currency,
        })
      : value.toFixed(2);
  const unknownVolume = dataset.candles.filter(
    (candle) => candle.volume === null,
  ).length;
  return (
    <>
      <section
        className="summary workspace-summary"
        aria-label="Dataset summary"
      >
        <div className="listing-header">
          <div className="listing">
            <div>
              <h2>
                {listing.symbol}{' '}
                <span>{listing.name ?? 'Name unavailable'}</span>
              </h2>
              <p className="small">
                {listing.exchange ?? 'Exchange unavailable'} ·{' '}
                {listing.currency ?? 'Currency unavailable'} · {interval} ·{' '}
                {listing.timezone ?? 'Timezone unavailable'}
              </p>
            </div>
          </div>
          <div className="listing-provenance">
            <span className="badge">
              {demo ? 'SYNTHETIC' : metadata.mode.toUpperCase()}
            </span>
            <span className="small">
              {latest.time}
              {latest.incomplete ? ' · Provisional' : ''}
            </span>
            <span className="badge">
              {demo
                ? 'Historical demo · fixed dataset'
                : live
                  ? stale
                    ? 'Stale loaded data'
                    : 'Provider history · delay unverified'
                  : 'Historical import'}
            </span>
            <button onClick={onChangeData}>Change data</button>
          </div>
        </div>
        <div className="summary-strip">
          <GlassPanel className="summary-price metric-card">
            <span className="metric-label">
              LATEST CLOSE{latest.incomplete ? ' · PROVISIONAL' : ''}
            </span>
            <strong>{money(latest.close)}</strong>
            <span
              className={
                change !== null && change < 0 ? 'negative' : 'positive'
              }
            >
              {change === null
                ? 'Unavailable'
                : `${change >= 0 ? '+' : '−'}${money(Math.abs(change))}${percent === null ? '' : ` (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`}`}
            </span>
            <span className="small">
              {interval === 'daily'
                ? 'Previous-session change'
                : 'Previous-bar change'}
            </span>
          </GlassPanel>
          <GlassPanel className="summary-stat metric-card">
            <span className="metric-label">LATEST VOLUME</span>
            <strong title={latest.volume?.toLocaleString('en-US')}>
              {latest.volume === null
                ? 'Unavailable'
                : formatValue(latest.volume, 'volume')}
            </strong>
            <span className="small">
              {demo
                ? 'Synthetic units'
                : live
                  ? 'As supplied by provider'
                  : 'As supplied in CSV'}
            </span>
          </GlassPanel>
          <div
            className="coverage-strip"
            role="region"
            aria-label="Daily coverage metrics"
          >
            <GlassPanel className="metric-card">
              <span className="metric-label">52-WEEK HIGH / LOW</span>
              <strong>
                {summary.high52 === null || summary.low52 === null
                  ? 'Unavailable'
                  : `${money(summary.high52)} / ${money(summary.low52)}`}
              </strong>
              {summary.high52 === null || summary.low52 === null ? (
                <p className="small">
                  Needs 52 weeks and 252 finalized daily bars
                </p>
              ) : (
                <div className="coverage-track" aria-hidden="true">
                  <span
                    style={{
                      left: `${summary.high52 === summary.low52 ? 50 : Math.max(0, Math.min(100, ((sourceDataset.candles.filter((bar) => !bar.incomplete).at(-1)!.close - summary.low52) / (summary.high52 - summary.low52)) * 100))}%`,
                    }}
                  />
                </div>
              )}
              <p className="small">
                Finalized daily source · {summary.time ?? 'unavailable'}
              </p>
            </GlassPanel>
            <GlassPanel className="metric-card">
              <span className="metric-label">DISTANCE FROM DAILY SMA-200</span>
              <strong>
                {summary.distance200 === null
                  ? 'Unavailable'
                  : `${summary.distance200 >= 0 ? '+' : ''}${summary.distance200.toFixed(2)}%`}
              </strong>
              <p className="small">
                {summary.distance200 === null
                  ? 'Needs 200 finalized daily bars and nonzero average'
                  : 'Independent of chart range and interval'}
              </p>
            </GlassPanel>
          </div>
        </div>
      </section>
      {metadata.aggregation && (
        <div className="notice" role="status">
          {metadata.aggregation} Group timestamps mark the first calendar date,
          not the close date. Actual source coverage{' '}
          {metadata.aggregationDetails?.sourceCoverage?.from} –{' '}
          {metadata.aggregationDetails?.sourceCoverage?.to}.{' '}
          {
            metadata.aggregationDetails?.groups.filter((group) => group.partial)
              .length
          }{' '}
          partial/unverified groups are excluded from finalized calculations.
          Week boundaries are Monday–Sunday; month boundaries use the source
          date calendar. No provider interval request is made.
        </div>
      )}
      {live && (
        <div className="notice" role="status">
          {metadata.source} ·{' '}
          {stale
            ? 'Stale: refresh failed or this data was fetched on an earlier exchange date. Loaded chart retained.'
            : `Fetched ${metadata.interval} history; real-time status and exchange delay are not verified.`}{' '}
          Actual coverage {metadata.coverage?.from} – {metadata.coverage?.to}.
          Refresh manually in Data connection. Provider data is session-only.
        </div>
      )}
      {latest.incomplete && (
        <div className="notice" role="status">
          Latest candle ({latest.time}) is incomplete. Its close, change and
          volume are provisional. Indicators exclude incomplete candles; latest
          valid values show their actual date.
        </div>
      )}
      {unknownVolume > 0 && (
        <div className="notice" role="status">
          {unknownVolume.toLocaleString('en-US')}{' '}
          {unknownVolume === 1 ? 'bar has' : 'bars have'} unknown volume.{' '}
          {unknownVolume === dataset.candles.length
            ? 'Volume pane unavailable.'
            : 'Unknown bars are omitted from the volume pane.'}{' '}
          Volume-dependent calculations cannot use missing volume.
        </div>
      )}
      <div className="focus-workspace">
        <GlassPanel className="chart-panel" aria-label="Price workspace">
          <div className="chart-heading">
            <div>
              <h2>Price & volume</h2>
              <p>
                {demo
                  ? 'Synthetic'
                  : live
                    ? metadata.provider === 'alpha-vantage'
                      ? 'Alpha Vantage'
                      : 'Twelve Data'
                    : 'Imported'}{' '}
                {interval} candles ·{' '}
                {dataset.candles.length.toLocaleString('en-US')} bars ·{' '}
                {metadata.adjustment} prices
              </p>
            </div>
            <div className="chart-controls">
              <label>
                View
                <select
                  aria-label="Chart view"
                  value={chartStyle}
                  onChange={(event) =>
                    setChartStyle(event.target.value as ChartStyle)
                  }
                >
                  <option value="candles">Candlestick</option>
                  <option value="line">Line</option>
                  <option value="area">Area</option>
                </select>
              </label>
              <label>
                Interval
                <select
                  aria-label="Interval"
                  value={interval}
                  disabled={sourceDataset.metadata.interval !== 'daily'}
                  onChange={(event) =>
                    setInterval(
                      event.target.value as Dataset['metadata']['interval'],
                    )
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">
                    {sourceDataset.metadata.interval === 'weekly'
                      ? 'Weekly / provider native'
                      : 'Weekly / local aggregation'}
                  </option>
                  <option value="monthly">
                    {sourceDataset.metadata.interval === 'monthly'
                      ? 'Monthly / provider native'
                      : 'Monthly / local aggregation'}
                  </option>
                </select>
              </label>
            </div>
            <div className="chart-toolbar">
              <div
                className="range-buttons"
                role="group"
                aria-label="Display range"
              >
                {(['1M', '3M', '6M', '1Y', 'ALL'] as DisplayRange[]).map(
                  (value) => (
                    <button
                      key={value}
                      aria-pressed={range === value}
                      onClick={() => setRange(value)}
                    >
                      {value === 'ALL' ? 'All' : value}
                    </button>
                  ),
                )}
              </div>
              <button className="reset-button" onClick={resetChart}>
                Reset view <span aria-hidden="true">↺</span>
              </button>
            </div>
          </div>
          <div
            className="overlay-chips"
            role="group"
            aria-label="Price overlays"
          >
            <span className="metric-label">OVERLAYS</span>
            {items
              .filter((item) => ['sma', 'ema', 'bands'].includes(item.id))
              .map((item) => (
                <button
                  key={item.id}
                  aria-pressed={visible[item.id]}
                  onClick={() =>
                    setVisible({ ...visible, [item.id]: !visible[item.id] })
                  }
                >
                  {item.name}
                </button>
              ))}
          </div>
          <div
            className="pane-selector"
            role="group"
            aria-label="Indicator pane"
          >
            {Object.entries(paneLabels).map(([id, label]) => (
              <button
                key={id}
                aria-label={`Plot ${label}`}
                aria-pressed={activePane === id}
                onClick={() => choosePane(id as IndicatorId)}
              >
                {label}
              </button>
            ))}
          </div>
          <PriceChart
            key={`${metadata.id}:${metadata.revision}:${interval}:${resetRevision}`}
            candles={dataset.candles}
            theme={theme}
            style={chartStyle}
            range={range}
            resetRevision={resetRevision}
            sourceLabel={
              demo
                ? 'synthetic'
                : live
                  ? `${metadata.provider === 'alpha-vantage' ? 'Alpha Vantage' : 'Twelve Data'} provider`
                  : 'imported'
            }
            indicators={items}
            interval={interval}
            activePane={activePane ?? null}
            visible={visible}
            onCursor={updateCursor}
            onVisibleWindow={updateWindow}
          />
          <div className="chart-footnote">
            <span>
              Hover to inspect · click or tap to pin · arrows to step · drag to
              pan
            </span>
            <span>
              {unknownVolume === dataset.candles.length
                ? 'Volume unavailable'
                : 'Volume in lower pane'}{' '}
              · shared time scale and cursor across visible panes
            </span>
          </div>
        </GlassPanel>
        <aside className="readout-rail" aria-label="Indicator values">
          <div className={`readout-heading${cursor ? ' inspecting' : ''}`}>
            <h2>
              Indicator readout{' '}
              <span className="badge">{cursor ? 'CURSOR' : 'LATEST'}</span>
            </h2>
            <p className="small">
              {cursor
                ? `Values at the inspected bar · ${cursor}`
                : 'Latest valid values · each with its own date'}
            </p>
          </div>
          <section
            className="indicators-panel"
            aria-label="Indicator workspace"
          >
            {!saved && (
              <p role="status">
                Layout and parameters apply for this session only; browser
                storage is unavailable.
              </p>
            )}
            {(
              ['Price & Trend', 'Momentum', 'Volatility', 'Volume'] as const
            ).map((group) => (
              <GlassPanel className="readout-group" key={group}>
                <h3>
                  {group}{' '}
                  <span>
                    {items.filter((item) => item.group === group).length +
                      (group === 'Volume' ? 1 : 0)}
                  </span>
                </h3>
                {group === 'Volume' && (
                  <article className="raw-volume" aria-label="Raw volume">
                    <h3>Volume</h3>
                    <strong
                      title={inspectedBar.volume?.toLocaleString('en-US')}
                    >
                      {inspectedBar.volume === null
                        ? 'Unavailable'
                        : formatValue(inspectedBar.volume, 'volume')}
                    </strong>
                    <p className="small">
                      {cursor ? 'Cursor' : 'Latest bar'} · {inspectedBar.time}
                      {inspectedBar.incomplete ? ' · Provisional' : ''} · units
                      as supplied
                    </p>
                  </article>
                )}
                <div className="indicator-cards">
                  {items
                    .filter((item) => item.group === group)
                    .map((item) =>
                      visible[item.id] ? (
                        <IndicatorCard
                          key={item.id}
                          item={item}
                          candles={dataset.candles}
                          cursor={cursor}
                          currency={listing.currency}
                          interval={interval}
                          collapsed={collapsed[item.id]}
                          expanded={expanded === item.id}
                          onToggle={(checked) =>
                            setVisible({ ...visible, [item.id]: checked })
                          }
                          onCollapse={() =>
                            update({
                              collapsed: {
                                ...collapsed,
                                [item.id]: !collapsed[item.id],
                              },
                            })
                          }
                          onExpand={() =>
                            update({
                              expanded: expanded === item.id ? null : item.id,
                              collapsed: { ...collapsed, [item.id]: false },
                            })
                          }
                        />
                      ) : (
                        <label className="disabled-indicator" key={item.id}>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() =>
                              setVisible({ ...visible, [item.id]: true })
                            }
                          />
                          {item.name}
                        </label>
                      ),
                    )}
                </div>
              </GlassPanel>
            ))}
          </section>
        </aside>
      </div>
      <GlassPanel className="calculation-settings">
        <IndicatorControls
          parameters={parameters}
          onParameters={setParameters}
          visible={visible}
          onVisibility={setVisible}
          items={items}
          hideVisibility
        />
        <button onClick={reset}>Reset panel layout and parameters</button>
      </GlassPanel>
      <GlassPanel className="export-panel" aria-label="Export dataset">
        <h2>Export loaded data</h2>
        <label>
          Export scope
          <select
            aria-label="Export scope"
            value={exportScope}
            onChange={(event) =>
              setExportScope(event.target.value as 'full' | 'visible')
            }
          >
            <option value="full">Full loaded history</option>
            <option value="visible">Visible chart window</option>
          </select>
        </label>
        <button
          onClick={() => {
            const output = exportDataset(
              dataset,
              parameters,
              exportScope === 'visible' ? exportWindow.current : null,
            );
            downloadText(
              output.csv,
              `${output.filename}.csv`,
              'text/csv;charset=utf-8',
            );
            setExportStatus(
              `Exported ${output.rows} ${interval} rows with every named series and active parameters.`,
            );
          }}
        >
          Download CSV
        </button>
        <button
          onClick={() => {
            const output = exportDataset(
              dataset,
              parameters,
              exportScope === 'visible' ? exportWindow.current : null,
            );
            downloadText(
              output.metadata,
              `${output.filename}.metadata.json`,
              'application/json',
            );
            setExportStatus('Export metadata downloaded.');
          }}
        >
          Download export metadata
        </button>
        <p className="small">
          OHLCV and every named calculation, including hidden panels. Null
          values stay empty; calculations use full history before slicing the
          visible chart window. CSV includes source, adjustment and parameters;
          companion JSON includes complete provenance. Provider exports are for
          your own permitted use; application licensing does not grant
          redistribution rights.
        </p>
        {exportStatus && <p role="status">{exportStatus}</p>}
      </GlassPanel>
      <div className="dataset-note">
        <span className="badge">{metadata.mode.toUpperCase()}</span>
        <p>
          {demo
            ? 'Generated prices for an imaginary listing. Weekday cadence; no actual exchange calendar or market feed.'
            : live
              ? `Data provided by ${metadata.provider === 'alpha-vantage' ? 'Alpha Vantage' : 'Twelve Data'}. Account/market access and available history vary. Native exchange dates are preserved; current-period bars are provisional. Adjustment: ${metadata.adjustment}.`
              : 'User-owned CSV; prices and metadata supplied by you, with no live market verification.'}{' '}
          Coverage {metadata.coverage?.from} – {metadata.coverage?.to}.{' '}
          {metadata.importConventions?.timezoneInterpretation}
        </p>
      </div>
    </>
  );
}
