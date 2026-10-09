import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassPanel } from '../../components/GlassPanel';
import { PriceChart } from '../../charts/PriceChart';
import type { Dataset, TradingDate } from '../../data/types';
import type { Parameters } from '../../indicators/core';
import type { Visibility } from '../../indicators/presentation';
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
  const { parameters, visible, collapsed, expanded, saved, update, reset } =
    useDashboard();
  const setParameters = (parameters: Parameters) => update({ parameters });
  const setVisible = (visible: Visibility) => update({ visible });
  const exportWindow = useRef<ExportWindow | null>(null);
  const [exportScope, setExportScope] = useState<'full' | 'visible'>('full');
  const [exportStatus, setExportStatus] = useState('');
  const updateWindow = useCallback((window: ExportWindow | null) => {
    exportWindow.current = window;
  }, []);
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
    cursorSelection?.id === dataset.metadata.id ? cursorSelection.time : null;
  const updateCursor = useCallback(
    (time: TradingDate | null) =>
      setCursorSelection((previous) =>
        previous?.id === dataset.metadata.id && previous.time === time
          ? previous
          : { id: dataset.metadata.id, time },
      ),
    [dataset.metadata.id],
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
      <GlassPanel className="summary" aria-label="Dataset summary">
        <div className="listing">
          <span className="ticker-icon" aria-hidden="true">
            {listing.symbol[0]}
          </span>
          <div>
            <h2>
              {listing.symbol}{' '}
              <span className="badge">
                {demo ? 'SYNTHETIC' : metadata.mode.toUpperCase()}
              </span>
            </h2>
            <p>{listing.name ?? 'Name unavailable'}</p>
            <p className="small">
              {listing.exchange ?? 'Exchange unavailable'} ·{' '}
              {listing.currency ?? 'Currency unavailable'} · {metadata.interval}{' '}
              · {listing.timezone ?? 'Timezone unavailable'}
            </p>
          </div>
        </div>
        <div className="summary-price">
          <span className="metric-label">
            LATEST CLOSE{latest.incomplete ? ' · PROVISIONAL' : ''}
          </span>
          <strong>{money(latest.close)}</strong>
          <span
            className={change !== null && change < 0 ? 'negative' : 'positive'}
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
        </div>
        <div className="summary-stat">
          <span className="metric-label">VOLUME</span>
          <strong>
            {latest.volume?.toLocaleString('en-US') ?? 'Unavailable'}
          </strong>
          <span className="small">
            {demo
              ? 'Synthetic units'
              : live
                ? 'As supplied by provider'
                : 'As supplied in CSV'}
          </span>
        </div>
        <div className="summary-stat">
          <span className="metric-label">DATA DATE</span>
          <strong>{latest.time}</strong>
          <span className="small">
            {demo
              ? 'Historical demo · fixed dataset'
              : live
                ? `${stale ? 'Stale loaded data' : 'Daily provider data'} · freshness/delay unverified`
                : 'Historical import · freshness not verified'}
          </span>
        </div>
      </GlassPanel>
      <GlassPanel className="summary" aria-label="Daily coverage metrics">
        <div>
          <span className="metric-label">52-WEEK HIGH / LOW</span>
          <p>
            {summary.high52 === null || summary.low52 === null
              ? 'Unavailable · needs 52 weeks and 252 finalized daily bars'
              : `${money(summary.high52)} / ${money(summary.low52)}`}
          </p>
        </div>
        <div>
          <span className="metric-label">DISTANCE FROM DAILY SMA-200</span>
          <p>
            {summary.distance200 === null
              ? 'Unavailable · needs 200 finalized daily bars and nonzero average'
              : `${summary.distance200.toFixed(2)}%`}
          </p>
        </div>
        <p className="small">
          Daily source history · finalized as of {summary.time ?? 'unavailable'}{' '}
          · independent of visible range and selected interval.
        </p>
      </GlassPanel>
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
        <PriceChart
          key={metadata.id}
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
          visible={visible}
          onCursor={updateCursor}
          onVisibleWindow={updateWindow}
        />
        <div className="chart-footnote">
          <span>Drag to pan · scroll or pinch to zoom</span>
          <span>
            {unknownVolume === dataset.candles.length
              ? 'Volume unavailable'
              : 'Volume in lower pane'}{' '}
            · shared time scale and cursor across visible panes
          </span>
        </div>
      </GlassPanel>
      <GlassPanel className="indicators-panel" aria-label="Indicator workspace">
        {!saved && (
          <p role="status">
            Layout and parameters apply for this session only; browser storage
            is unavailable.
          </p>
        )}
        <button onClick={reset}>Reset panel layout and parameters</button>
        <IndicatorControls
          parameters={parameters}
          onParameters={setParameters}
          visible={visible}
          onVisibility={setVisible}
          items={items}
        />
        <div className="indicator-cards">
          {items
            .filter((item) => visible[item.id])
            .map((item) => (
              <IndicatorCard
                key={item.id}
                item={item}
                candles={dataset.candles}
                cursor={cursor}
                currency={listing.currency}
                interval={interval}
                collapsed={collapsed[item.id]}
                expanded={expanded === item.id}
                onCollapse={() =>
                  update({
                    collapsed: { ...collapsed, [item.id]: !collapsed[item.id] },
                  })
                }
                onExpand={() =>
                  update({
                    expanded: expanded === item.id ? null : item.id,
                    collapsed: { ...collapsed, [item.id]: false },
                  })
                }
              />
            ))}
        </div>
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
        <button onClick={onChangeData}>Change data</button>
      </div>
    </>
  );
}
