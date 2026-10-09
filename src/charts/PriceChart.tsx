import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  IPriceLine,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import type { Candle, TradingDate } from '../data/types';
import type { Dataset } from '../data/types';
import type {
  IndicatorDefinition,
  Visibility,
} from '../indicators/presentation';
import type { ChartStyle, DisplayRange } from '../state/workspace';
import type { ThemeDefinition } from '../themes/themes';

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
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<ChartHandle | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
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
      },
      timeScale: { timeVisible: false, borderVisible: true, rightOffset: 3 },
      rightPriceScale: { minimumWidth: 64 },
      crosshair: { mode: 0 },
    });
    const candleSeries = chart.addSeries(CandlestickSeries);
    const line = chart.addSeries(LineSeries, { visible: false, lineWidth: 2 });
    const area = chart.addSeries(AreaSeries, { visible: false, lineWidth: 2 });
    const volume = candles.some((candle) => candle.volume !== null)
      ? chart.addSeries(
          HistogramSeries,
          {
            priceFormat: { type: 'volume' },
            priceScaleId: 'right',
          },
          1,
        )
      : null;
    chart.panes()[1]?.setHeight(110);
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
        cursorCallback.current?.(null);
        return;
      }
      const time =
        typeof event.time === 'object'
          ? `${event.time.year}-${String(event.time.month).padStart(2, '0')}-${String(event.time.day).padStart(2, '0')}`
          : String(event.time);
      setHover(byDate.get(time) ?? null);
      cursorCallback.current?.(byDate.get(time)?.time ?? null);
    };
    chart.subscribeCrosshairMove(crosshair);
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
    };
    return () => {
      chart.unsubscribeCrosshairMove(crosshair);
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
            ? api.chart.addSeries(HistogramSeries, { title: entry.name }, pane)
            : api.chart.addSeries(
                LineSeries,
                {
                  title: entry.name,
                  lineWidth: 1,
                  lineStyle: index % 3,
                  priceFormat:
                    item.units === 'volume'
                      ? { type: 'volume' }
                      : { type: 'price', precision: 4, minMove: 0.0001 },
                },
                pane,
              ));
        series.applyOptions({ title: entry.name });
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
            index === 0 ? 420 : index === 1 && api.volume ? 110 : 170,
          ),
        );
    if (savedRange) api.chart.timeScale().setVisibleLogicalRange(savedRange);
    // The owning chart effect removes all series/listeners on unmount.
    // Parameter changes reuse series; only a pane topology change remounts them.
  }, [candles, indicators, visible]);

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
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: {
        vertLine: { color: palette.crosshair },
        horzLine: { color: palette.crosshair },
      },
    });
    api.candles.applyOptions({
      upColor: palette.positive,
      downColor: palette.negative,
      borderUpColor: palette.positive,
      borderDownColor: palette.negative,
      wickUpColor: palette.positive,
      wickDownColor: palette.negative,
    });
    api.line.applyOptions({ color: palette.accent });
    api.area.applyOptions({
      lineColor: palette.accent,
      topColor: palette.areaTop,
      bottomColor: palette.areaBottom,
    });
    api.indicators.forEach((series, index) =>
      series.applyOptions({
        color: [palette.accent, palette.positive, palette.negative][index % 3],
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

  const current = hover ?? candles.at(-1);
  const lowerPanes =
    indicators?.filter(
      (item) =>
        visible?.[item.id] &&
        !['sma', 'ema', 'bands', 'volumeAverage'].includes(item.id) &&
        item.series.some((series) =>
          series.values.some((value) => value !== null),
        ),
    ).length ?? 0;
  return (
    <>
      <div className="chart-legend" aria-live="off">
        <span>
          {hover ? 'Cursor' : 'Latest bar'} · {current?.time}
        </span>
        <span>
          O <strong>{current?.open.toFixed(2)}</strong>
        </span>
        <span>
          H <strong>{current?.high.toFixed(2)}</strong>
        </span>
        <span>
          L <strong>{current?.low.toFixed(2)}</strong>
        </span>
        <span>
          C <strong>{current?.close.toFixed(2)}</strong>
        </span>
        <span>
          Volume{' '}
          <strong>
            {current?.volume?.toLocaleString('en-US') ?? 'Unavailable'}
          </strong>
        </span>
      </div>
      <div
        ref={container}
        className="price-chart"
        data-testid="price-chart"
        style={
          indicators
            ? {
                height:
                  420 +
                  (candles.some((bar) => bar.volume !== null) ? 110 : 0) +
                  lowerPanes * 170,
              }
            : undefined
        }
        role="img"
        aria-label={`Interactive ${sourceLabel} ${interval} price chart${candles.some((candle) => candle.volume !== null) ? ' with a volume pane' : '; volume unavailable'}. Drag to pan and scroll to zoom. Exact latest values appear in the summary and legend.`}
      />
    </>
  );
}
