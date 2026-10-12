import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import type { Candle, TradingDate } from '../data/types';
import type { IndicatorDefinition } from '../indicators/presentation';
import type { ThemeDefinition } from '../themes/themes';
import { formatValue } from '../features/dashboard/readout';
import { PriceChart } from './PriceChart';
import type { PriceChartProps } from './PriceChart';
import { useTypography } from '../themes/TypographyContext';
import { fontOptions } from '../storage/typography-preference';

type Window = { from: number; to: number } | null;
type Inspection = { time: TradingDate | null; pin: boolean };
type PlotSeries = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>;

function date(time: Time): TradingDate {
  return (
    typeof time === 'object'
      ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
      : String(time)
  ) as TradingDate;
}

function DetailPlot({
  candles,
  theme,
  item,
  volume = false,
  cursor,
  register,
  onWindow,
  onInspect,
}: {
  candles: Candle[];
  theme: ThemeDefinition;
  item?: IndicatorDefinition;
  volume?: boolean;
  cursor: TradingDate | null;
  register: (chart: IChartApi | null) => void;
  onWindow: (window: Window) => void;
  onInspect: (inspection: Inspection) => void;
}) {
  const typography = useTypography();
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<IChartApi | null>(null);
  const plots = useRef<{ series: PlotSeries; values: (number | null)[] }[]>([]);
  const programmatic = useRef(false);
  const pointerInside = useRef(false);
  const callbacks = useRef({ register, onWindow, onInspect });
  useEffect(() => {
    callbacks.current = { register, onWindow, onInspect };
  }, [register, onWindow, onInspect]);
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        fontFamily: 'Inter, Segoe UI, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      rightPriceScale: {
        minimumWidth: 64,
        borderVisible: false,
        scaleMargins: { top: 0.25, bottom: 0.08 },
      },
      timeScale: {
        visible: !volume,
        timeVisible: false,
        rightOffset: 3,
        borderVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
      crosshair: { mode: 0 },
    });
    api.current = chart;
    const inspect = (event: MouseEventParams<Time>, pin = false) => {
      if (
        programmatic.current ||
        (!pin && (!pointerInside.current || !event.sourceEvent))
      )
        return;
      callbacks.current.onInspect({
        time: event.time && event.point ? date(event.time) : null,
        pin,
      });
    };
    const hover = (event: MouseEventParams<Time>) => inspect(event);
    const click = (event: MouseEventParams<Time>) => {
      if (event.time) inspect(event, true);
    };
    const window = (value: Window) => {
      if (!programmatic.current) callbacks.current.onWindow(value);
    };
    chart.subscribeCrosshairMove(hover);
    chart.subscribeClick(click);
    chart.timeScale().subscribeVisibleLogicalRangeChange(window);
    return () => {
      callbacks.current.register(null);
      chart.unsubscribeCrosshairMove(hover);
      chart.unsubscribeClick(click);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(window);
      chart.remove();
      api.current = null;
      plots.current = [];
    };
  }, [candles, volume]);
  useEffect(() => {
    const chart = api.current;
    if (!chart) return;
    const palette = theme.chart;
    const savedRange = chart.timeScale().getVisibleLogicalRange();
    programmatic.current = true;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
        fontFamily:
          typography.font === 'system'
            ? (theme.css['--theme-font-family'] ?? fontOptions.system.family)
            : fontOptions[typography.font].family,
        fontSize: Math.round((11 * typography.size) / 100),
      },
      grid: {
        vertLines: { color: palette.grid, visible: false },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        vertLine: { color: palette.crosshair, style: LineStyle.Dashed },
        horzLine: { color: palette.crosshair, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        minimumWidth: Math.round((64 * typography.size) / 100),
      },
    });
    plots.current.forEach(({ series }) => chart.removeSeries(series));
    plots.current = [];
    const entries = volume
      ? [
          {
            name: 'Volume',
            values: candles.map((bar) => bar.volume),
            histogram: true,
          },
          ...(item?.series ?? []),
        ]
      : (item?.series ?? []);
    entries.forEach((entry, index) => {
      const color = [palette.accent, palette.crosshair, palette.negative][
        index % 3
      ]!;
      const series = entry.histogram
        ? chart.addSeries(HistogramSeries, {
            color,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: {
              type: volume || item?.units === 'volume' ? 'volume' : 'price',
            },
          })
        : chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            lineStyle: index % 3,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: {
              type: 'custom',
              minMove: 0.0001,
              formatter: (value: number) =>
                formatValue(value, item?.units ?? 'volume'),
            },
          });
      series.setData(
        candles.map((bar, i) =>
          entry.values[i] === null
            ? { time: bar.time }
            : {
                time: bar.time,
                value: entry.values[i]!,
                ...(volume && index === 0
                  ? {
                      color:
                        bar.close >= bar.open
                          ? palette.positive
                          : palette.negative,
                    }
                  : {}),
              },
        ),
      );
      if (index === 0)
        item?.guides?.forEach((price) =>
          series.createPriceLine({
            price,
            color: palette.border,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
          }),
        );
      plots.current.push({ series, values: entry.values });
    });
    if (savedRange) chart.timeScale().setVisibleLogicalRange(savedRange);
    callbacks.current.register(chart);
    programmatic.current = false;
  }, [candles, volume, item, theme, typography]);
  useEffect(() => {
    const chart = api.current;
    if (!chart) return;
    const index = candles.findIndex((bar) => bar.time === cursor);
    const plot = plots.current.find(
      (plot) => index >= 0 && plot.values[index] !== null,
    );
    programmatic.current = true;
    if (cursor && plot)
      chart.setCrosshairPosition(plot.values[index]!, cursor, plot.series);
    else chart.clearCrosshairPosition();
    programmatic.current = false;
  }, [cursor, candles, item, theme, typography]);
  const index = cursor
    ? candles.findIndex((bar) => bar.time === cursor)
    : candles.length - 1;
  return (
    <div className={`detail-plot ${volume ? 'volume-plot' : 'indicator-plot'}`}>
      <div className="pane-caption">
        <span>{volume ? 'Volume' : (item?.name ?? 'Indicator')}</span>
        {volume ? (
          <b>
            {candles[index]?.volume == null
              ? 'Unavailable'
              : formatValue(candles[index]!.volume!, 'volume')}
          </b>
        ) : (
          item?.series.map((entry) => (
            <span key={entry.name}>
              {entry.name}{' '}
              <b>
                {entry.values[index] == null
                  ? 'Unavailable'
                  : formatValue(entry.values[index]!, item.units)}
              </b>
            </span>
          ))
        )}
      </div>
      <div
        ref={container}
        className="detail-chart-host"
        data-testid={volume ? 'volume-chart' : 'indicator-chart'}
        role="img"
        onPointerEnter={() => {
          pointerInside.current = true;
        }}
        onPointerLeave={() => {
          pointerInside.current = false;
          callbacks.current.onInspect({ time: null, pin: false });
        }}
        aria-label={
          volume
            ? 'Volume chart'
            : `${item?.name ?? 'Unavailable indicator'} chart`
        }
      />
      {!volume &&
        (!item ||
          !item.series.some((series) =>
            series.values.some((value) => value !== null),
          )) && (
          <p className="plot-unavailable">
            Not enough finalized history for this indicator.
          </p>
        )}
    </div>
  );
}

export function SplitChart({
  controls,
  onVisibleWindow,
  ...props
}: PriceChartProps & { controls: ReactNode }) {
  const charts = useRef(new Map<string, IChartApi>());
  const viewport = useRef<Window>(null);
  const syncing = useRef(false);
  const axisFrame = useRef<number | null>(null);
  const alignAxes = useCallback(() => {
    if (axisFrame.current !== null) return;
    axisFrame.current = requestAnimationFrame(() => {
      // The renderer computes label widths in its pending animation frame.
      axisFrame.current = requestAnimationFrame(() => {
        axisFrame.current = null;
        // Labels can exceed minimumWidth, depending on the data and installed font.
        // Give every pane the widest axis so an x-coordinate maps to the same date.
        const width = Math.max(
          0,
          ...Array.from(charts.current.values(), (chart) =>
            chart.priceScale('right').width(),
          ),
        );
        const window = viewport.current;
        syncing.current = true;
        try {
          charts.current.forEach((chart) => {
            const axis = chart.priceScale('right');
            if (axis.options().minimumWidth < width) {
              axis.applyOptions({ minimumWidth: width });
              if (window) chart.timeScale().setVisibleLogicalRange(window);
            }
          });
        } finally {
          syncing.current = false;
        }
      });
    });
  }, []);
  useEffect(
    () => () => {
      if (axisFrame.current !== null) cancelAnimationFrame(axisFrame.current);
      axisFrame.current = null;
    },
    [],
  );
  const [cursor, setCursor] = useState<TradingDate | null>(null);
  const inspector = useRef<((request: Inspection) => void) | null>(null);
  const moveWindow = useCallback(
    (source: string, window: Window) => {
      if (syncing.current || !window) return;
      syncing.current = true;
      viewport.current = window;
      charts.current.forEach((chart, key) => {
        if (key !== source) chart.timeScale().setVisibleLogicalRange(window);
      });
      onVisibleWindow?.(window);
      syncing.current = false;
      alignAxes();
    },
    [onVisibleWindow, alignAxes],
  );
  const register = useCallback(
    (key: string, chart: IChartApi | null) => {
      const previous = charts.current.get(key);
      if (previous !== chart) {
        previous?.timeScale().unsubscribeSizeChange(alignAxes);
        chart?.timeScale().subscribeSizeChange(alignAxes);
      }
      if (!chart) {
        charts.current.delete(key);
        return;
      }
      charts.current.set(key, chart);
      if (viewport.current) {
        syncing.current = true;
        chart.timeScale().setVisibleLogicalRange(viewport.current);
        syncing.current = false;
      }
      alignAxes();
    },
    [alignAxes],
  );
  const lower = props.indicators?.find((item) => item.id === props.activePane);
  const volumeAverage = props.visible?.volumeAverage
    ? props.indicators?.find((item) => item.id === 'volumeAverage')
    : undefined;
  return (
    <div className="split-charts">
      <div className="price-plot">
        <PriceChart
          {...props}
          priceOnly
          onInspectorReady={(inspect) => {
            inspector.current = inspect;
          }}
          onChartReady={(chart) => register('price', chart)}
          onVisibleWindow={(window) => moveWindow('price', window)}
          onCursor={(time) => {
            setCursor(time);
            props.onCursor?.(time);
          }}
        />
      </div>
      {props.candles.some((bar) => bar.volume !== null) && (
        <DetailPlot
          candles={props.candles}
          theme={props.theme}
          item={volumeAverage}
          volume
          cursor={cursor}
          register={(chart) => register('volume', chart)}
          onWindow={(window) => moveWindow('volume', window)}
          onInspect={(request) => inspector.current?.(request)}
        />
      )}
      {controls}
      <DetailPlot
        candles={props.candles}
        theme={props.theme}
        item={lower}
        cursor={cursor}
        register={(chart) => register('indicator', chart)}
        onWindow={(window) => moveWindow('indicator', window)}
        onInspect={(request) => inspector.current?.(request)}
      />
    </div>
  );
}
