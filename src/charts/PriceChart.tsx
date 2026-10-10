import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createSeriesMarkers,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  IPriceLine,
  MouseEventParams,
  Time,
  ISeriesMarkersPluginApi,
} from 'lightweight-charts';
import type { Candle, TradingDate } from '../data/types';
import type { Dataset } from '../data/types';
import type {
  IndicatorDefinition,
  Visibility,
} from '../indicators/presentation';
import type { ChartStyle, DisplayRange } from '../state/workspace';
import type { ThemeDefinition } from '../themes/themes';
import type { IndicatorId } from '../indicators/presentation';
import { formatValue } from '../features/dashboard/readout';

interface Props {
  candles: Candle[];
  theme: ThemeDefinition;
  style: ChartStyle;
  range: DisplayRange;
  resetRevision: number;
  sourceLabel?: string;
  indicators?: IndicatorDefinition[];
  visible?: Visibility;
  onVisibleWindow?: (window: { from: number; to: number } | null) => void;
  onCursor?: (time: TradingDate | null) => void;
  interval?: Dataset['metadata']['interval'];
  activePane?: IndicatorId | null;
}
interface ChartHandle {
  chart: IChartApi;
  candles: ISeriesApi<'Candlestick'>;
  line: ISeriesApi<'Line'>;
  area: ISeriesApi<'Area'>;
  volume: ISeriesApi<'Histogram'> | null;
  indicators: (ISeriesApi<'Line'> | ISeriesApi<'Histogram'>)[];
  guides: IPriceLine[];
  topology: string;
  markers: ISeriesMarkersPluginApi<Time>;
}

export function PriceChart({
  candles,
  theme,
  style,
  range,
  resetRevision,
  sourceLabel = 'synthetic',
  indicators,
  visible,
  onCursor,
  onVisibleWindow,
  interval = 'daily',
  activePane,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<ChartHandle | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [pinned, setPinned] = useState<Candle | null>(null);
  const inspected = hover ?? pinned;
  const cursorCallback = useRef(onCursor);
  const windowCallback = useRef(onVisibleWindow);
  useEffect(() => {
    windowCallback.current = onVisibleWindow;
  }, [onVisibleWindow]);
  const palette = useRef(theme.chart);
  useEffect(() => {
    palette.current = theme.chart;
  }, [theme]);
  useEffect(() => {
    cursorCallback.current = onCursor;
  }, [onCursor]);

  useEffect(() => {
    if (!container.current || candles.length === 0) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        attributionLogo: true,
        fontFamily: 'Inter, Segoe UI, sans-serif',
        fontSize: 11,
        panes: { enableResize: false },
      },
      timeScale: { timeVisible: false, borderVisible: true, rightOffset: 3 },
      rightPriceScale: { minimumWidth: 64 },
      crosshair: { mode: 0 },
      handleScroll: { vertTouchDrag: false },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    const line = chart.addSeries(LineSeries, { visible: false, lineWidth: 2 });
    const area = chart.addSeries(AreaSeries, { visible: false, lineWidth: 2 });
    const volume = candles.some((candle) => candle.volume !== null)
      ? chart.addSeries(
          HistogramSeries,
          {
            priceFormat: { type: 'volume' },
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false,
          },
          1,
        )
      : null;
    chart.panes()[1]?.setHeight(74);
    candleSeries.setData(candles);
    const closes = candles.map(({ time, close }) => ({ time, value: close }));
    line.setData(closes);
    area.setData(closes);
    const byDate = new Map(
      candles.map((candle) => [candle.time as string, candle]),
    );
    const crosshair = (event: MouseEventParams<Time>) => {
      if (!event.time || !event.point) {
        setHover(null);
        return;
      }
      const time =
        typeof event.time === 'object'
          ? `${event.time.year}-${String(event.time.month).padStart(2, '0')}-${String(event.time.day).padStart(2, '0')}`
          : String(event.time);
      setHover(byDate.get(time) ?? null);
    };
    const pin = (event: MouseEventParams<Time>) => {
      if (!event.time) return;
      const time =
        typeof event.time === 'object'
          ? `${event.time.year}-${String(event.time.month).padStart(2, '0')}-${String(event.time.day).padStart(2, '0')}`
          : String(event.time);
      setPinned(byDate.get(time) ?? null);
      setHover(null);
    };
    chart.subscribeCrosshairMove(crosshair);
    chart.subscribeClick(pin);
    const windowChanged = (window: { from: number; to: number } | null) =>
      windowCallback.current?.(window);
    chart.timeScale().subscribeVisibleLogicalRangeChange(windowChanged);
    handle.current = {
      chart,
      candles: candleSeries,
      line,
      area,
      volume,
      indicators: [],
      guides: [],
      topology: '',
      markers: createSeriesMarkers(candleSeries),
    };
    return () => {
      chart.unsubscribeCrosshairMove(crosshair);
      chart.unsubscribeClick(pin);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(windowChanged);
      chart.remove();
      handle.current = null;
    };
  }, [candles]);

  useEffect(() => {
    const api = handle.current;
    if (!api || !indicators || !visible) return;
    const savedRange = api.chart.timeScale().getVisibleLogicalRange();
    const active = indicators.filter(
      (item) =>
        visible[item.id] &&
        (activePane === undefined ||
          ['sma', 'ema', 'bands', 'volumeAverage'].includes(item.id) ||
          item.id === activePane) &&
        (item.id !== 'volumeAverage' || api.volume) &&
        item.series.some((series) =>
          series.values.some((value) => value !== null),
        ),
    );
    const topology = JSON.stringify(
      active.map((item) => [
        item.id,
        item.units,
        item.guides,
        item.series.map((entry) => !!entry.histogram),
      ]),
    );
    const reuse = api.topology === topology;
    if (!reuse) {
      for (const series of [...api.indicators].reverse())
        api.chart.removeSeries(series);
      api.indicators = [];
      api.guides = [];
      api.topology = topology;
    }
    let seriesIndex = 0;
    let nextPane = api.volume ? 2 : 1;
    for (const item of active) {
      const pane = ['sma', 'ema', 'bands'].includes(item.id)
        ? 0
        : item.id === 'volumeAverage'
          ? 1
          : nextPane++;
      item.series.forEach((entry, index) => {
        const existing = reuse ? api.indicators[seriesIndex] : undefined;
        seriesIndex++;
        const series =
          existing ??
          (entry.histogram
            ? api.chart.addSeries(
                HistogramSeries,
                { lastValueVisible: false, priceLineVisible: false },
                pane,
              )
            : api.chart.addSeries(
                LineSeries,
                {
                  title: '',
                  lineWidth: 2,
                  lineStyle:
                    item.id === 'ema' || item.id === 'volumeAverage'
                      ? LineStyle.Dashed
                      : item.id === 'bands'
                        ? LineStyle.Dotted
                        : index % 3,
                  lastValueVisible: false,
                  priceLineVisible: false,
                  priceFormat:
                    item.units === 'volume'
                      ? { type: 'volume' }
                      : {
                          type: 'custom',
                          minMove: 0.0001,
                          formatter: (value: number) =>
                            formatValue(value, item.units),
                        },
                },
                pane,
              ));
        series.applyOptions({ title: '' });
        series.setData(
          candles.map((bar, i) =>
            entry.values[i] === null
              ? { time: bar.time }
              : { time: bar.time, value: entry.values[i]! },
          ),
        );
        if (!reuse && index === 0)
          item.guides?.forEach((price) =>
            api.guides.push(
              series.createPriceLine({
                price,
                color: palette.current.border,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: false,
                title: 'Reference',
              }),
            ),
          );
        if (!reuse) api.indicators.push(series);
      });
    }
    // Fixed heights set during insertion redistribute already-mounted panes.
    // Assign proportional weights after all insertions to keep every pane readable.
    if (!reuse)
      api.chart
        .panes()
        .forEach((pane, index) =>
          pane.setStretchFactor(
            index === 0 ? 352 : index === 1 && api.volume ? 74 : 130,
          ),
        );
    if (savedRange) api.chart.timeScale().setVisibleLogicalRange(savedRange);
    // The owning chart effect removes all series/listeners on unmount.
    // Parameter changes reuse series; only a pane topology change remounts them.
  }, [candles, indicators, visible, activePane]);

  useEffect(() => {
    cursorCallback.current?.(inspected?.time ?? null);
    const api = handle.current;
    if (!api) return;
    if (pinned && !hover) {
      const series =
        style === 'candles'
          ? api.candles
          : style === 'area'
            ? api.area
            : api.line;
      api.chart.setCrosshairPosition(pinned.close, pinned.time, series);
    } else if (!inspected) api.chart.clearCrosshairPosition();
  }, [inspected, pinned, hover, style]);

  useEffect(() => {
    const api = handle.current;
    if (!api) return;
    const palette = theme.chart;
    api.guides.forEach((guide) =>
      guide.applyOptions({ color: palette.border }),
    );
    api.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid, visible: false },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        vertLine: { color: palette.crosshair, style: LineStyle.Dashed },
        horzLine: { color: palette.crosshair, style: LineStyle.Dashed },
      },
    });
    api.candles.applyOptions({
      upColor: 'transparent',
      downColor: palette.negative,
      borderUpColor: palette.positive,
      borderDownColor: palette.negative,
      wickUpColor: palette.positive,
      wickDownColor: palette.negative,
    });
    api.candles.setData(
      candles.map((bar) =>
        bar.incomplete
          ? {
              ...bar,
              color: 'transparent',
              borderColor: palette.accent,
              wickColor: palette.accent,
            }
          : bar,
      ),
    );
    api.markers.setMarkers(
      candles
        .filter((bar) => bar.incomplete)
        .map((bar) => ({
          time: bar.time,
          position: 'aboveBar',
          shape: 'square',
          color: palette.accent,
          text: 'PROV',
        })),
    );
    api.line.applyOptions({ color: palette.accent });
    api.area.applyOptions({
      lineColor: palette.accent,
      topColor: palette.areaTop,
      bottomColor: palette.areaBottom,
    });
    api.indicators.forEach((series, index) =>
      series.applyOptions({
        color: [palette.accent, palette.crosshair, palette.negative][index % 3],
      }),
    );
    api.volume?.setData(
      candles.map((candle) =>
        candle.volume === null
          ? { time: candle.time }
          : {
              time: candle.time,
              value: candle.volume,
              color:
                candle.close >= candle.open
                  ? palette.positive
                  : palette.negative,
            },
      ),
    );
  }, [theme, candles, indicators, visible]);

  useEffect(() => {
    const api = handle.current;
    if (!api) return;
    api.candles.applyOptions({ visible: style === 'candles' });
    api.line.applyOptions({ visible: style === 'line' });
    api.area.applyOptions({ visible: style === 'area' });
  }, [style, candles]);

  useEffect(() => {
    const chart = handle.current?.chart;
    if (!chart) return;
    // Calendar windows preserve their meaning across daily/weekly/monthly bars.
    const end = new Date(`${candles.at(-1)!.time}T12:00:00Z`);
    const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, ALL: Infinity }[
      range
    ];
    const start = new Date(end);
    if (Number.isFinite(months))
      start.setUTCMonth(start.getUTCMonth() - months);
    const first = Number.isFinite(months)
      ? candles.findIndex((bar) => bar.time >= start.toISOString().slice(0, 10))
      : 0;
    const count = Math.min(
      first < 0 ? 1 : candles.length - first,
      candles.length,
    );
    chart.timeScale().setVisibleLogicalRange({
      from: candles.length - count,
      to: candles.length + 2,
    });
  }, [range, resetRevision, candles]);

  const current = inspected ?? candles.at(-1);
  const step = (direction: number) => {
    const index = inspected
      ? candles.findIndex((bar) => bar.time === inspected.time)
      : candles.length - 1;
    const nextIndex = Math.max(
      0,
      Math.min(candles.length - 1, index + direction),
    );
    setPinned(candles[nextIndex]!);
    setHover(null);
    const scale = handle.current?.chart.timeScale();
    const window = scale?.getVisibleLogicalRange();
    if (window && (nextIndex < window.from || nextIndex > window.to)) {
      const width = window.to - window.from;
      scale?.setVisibleLogicalRange({
        from: nextIndex - width / 2,
        to: nextIndex + width / 2,
      });
    }
  };
  const lowerPanes =
    indicators?.filter(
      (item) =>
        visible?.[item.id] &&
        (activePane === undefined || item.id === activePane) &&
        !['sma', 'ema', 'bands', 'volumeAverage'].includes(item.id) &&
        item.series.some((series) =>
          series.values.some((value) => value !== null),
        ),
    ).length ?? 0;
  return (
    <>
      <div
        className={`chart-legend${inspected ? ' inspecting' : ''}`}
        aria-live="off"
      >
        <span>
          <b className="inspection-mode">
            {inspected
              ? pinned && !hover
                ? 'Cursor · pinned'
                : 'Cursor'
              : 'Latest bar'}
          </b>{' '}
          · {current?.time}
          {current?.incomplete ? ' · Provisional' : ''}
        </span>
        <span>
          O{' '}
          <strong title={current?.open.toString()}>
            {current?.open.toFixed(2)}
          </strong>
        </span>
        <span>
          H{' '}
          <strong title={current?.high.toString()}>
            {current?.high.toFixed(2)}
          </strong>
        </span>
        <span>
          L{' '}
          <strong title={current?.low.toString()}>
            {current?.low.toFixed(2)}
          </strong>
        </span>
        <span>
          C{' '}
          <strong title={current?.close.toString()}>
            {current?.close.toFixed(2)}
          </strong>
        </span>
        <span>
          Volume{' '}
          <strong title={current?.volume?.toLocaleString('en-US')}>
            {current?.volume === null || current?.volume === undefined
              ? 'Unavailable'
              : formatValue(current.volume, 'volume')}
          </strong>
        </span>
        <div className="inspection-actions">
          <button aria-label="Inspect previous bar" onClick={() => step(-1)}>
            ‹
          </button>
          <button
            aria-label="Inspect next bar"
            onClick={() => step(1)}
            disabled={current?.time === candles.at(-1)?.time}
          >
            ›
          </button>
          {inspected && (
            <button
              onClick={() => {
                setHover(null);
                setPinned(null);
              }}
            >
              Back to latest
            </button>
          )}
        </div>
      </div>
      <div
        ref={container}
        className="price-chart"
        data-testid="price-chart"
        style={
          indicators
            ? {
                height: `calc(var(--price-pane-height, 352px) + ${(candles.some((bar) => bar.volume !== null) ? 74 : 0) + lowerPanes * 130 + 28}px)`,
              }
            : undefined
        }
        role="img"
        tabIndex={0}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key))
            event.preventDefault();
          if (event.key === 'ArrowLeft') step(-1);
          if (event.key === 'ArrowRight') step(1);
          if (event.key === 'Escape') {
            setPinned(null);
            setHover(null);
          }
        }}
        aria-label={`Interactive ${sourceLabel} ${interval} price chart${candles.some((candle) => candle.volume !== null) ? ' with a volume pane' : '; volume unavailable'}. Drag to pan and scroll to zoom. Exact latest values appear in the summary and legend.`}
      />
    </>
  );
}
