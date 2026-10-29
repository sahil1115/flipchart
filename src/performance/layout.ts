import type { TradingDate } from '../data/types';
import { formatChange } from './performance';
import type { PerformanceResult } from './performance';

/**
 * Categorical colours in fixed order (never cycled), validated for colour
 * vision deficiency on adjacent lines. Light and dark are the same hues,
 * stepped for each surface. A colour follows its stock, not its rank.
 */
export const lineColors = {
  light: [
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#6250d6',
    '#e34948',
  ],
  dark: [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
  ],
} as const;
/** The index line is neutral ink, dashed, so it never reads as a stock. */
export const benchmarkColor = { light: '#52514e', dark: '#c3c2b7' } as const;
export const chartSize = { width: 780, height: 440 };

export interface Margin {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface LaidOutLine {
  symbol: string;
  color: string;
  benchmark: boolean;
  points: { x: number; y: number }[];
  end: { x: number; y: number };
  /** Direct label beside the right edge, nudged apart from its neighbours. */
  label: { y: number; text: string };
}
export interface PerformancePlot {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: (index: number) => number;
  y: (value: number) => number;
  yTicks: number[];
  xTicks: { index: number; label: string }[];
  lines: LaidOutLine[];
}

const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];

export function formatDate(date: TradingDate, long: boolean) {
  return new Intl.DateTimeFormat(
    'en-GB',
    long
      ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', timeZone: 'UTC' },
  ).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Positions for the comparison chart. The page's SVG and the exported image
 * both draw from this, so they always agree.
 */
export function performanceLayout(
  result: PerformanceResult,
  width: number,
  height: number,
  mode: 'light' | 'dark',
  margin: Margin = { left: 56, right: 104, top: 16, bottom: 32 },
  /** Narrow charts label lines by ticker only; values stay in the tooltip and table. */
  labelValues = true,
): PerformancePlot {
  const series = [
    ...result.stocks.map((line, index) => ({
      line,
      color: lineColors[mode][index % lineColors[mode].length]!,
      benchmark: false,
    })),
    ...(result.benchmark
      ? [
          {
            line: result.benchmark,
            color: benchmarkColor[mode],
            benchmark: true,
          },
        ]
      : []),
  ];
  const values = series.flatMap(({ line }) => line.changes);
  let low = Math.min(0, ...values);
  let high = Math.max(0, ...values);
  const span = Math.max(high - low, 2);
  const step = steps.find((size) => span / size <= 6) ?? steps.at(-1)!;
  low = Math.floor(low / step) * step;
  high = Math.ceil(high / step) * step;
  if (high === low) high = low + step;
  const yTicks: number[] = [];
  for (let tick = low; tick <= high + 1e-9; tick += step)
    yTicks.push(Number(tick.toFixed(4)));
  const left = margin.left;
  const right = width - margin.right;
  const top = margin.top;
  const bottom = height - margin.bottom;
  const count = result.dates.length;
  const x = (index: number) =>
    left + (count > 1 ? index / (count - 1) : 0) * (right - left);
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top);
  const long = count > 140;
  const tickCount = right - left < 360 ? 3 : 5;
  const xTicks = [
    ...new Set(
      Array.from({ length: tickCount }, (_, i) =>
        Math.round((i * (count - 1)) / (tickCount - 1)),
      ),
    ),
  ].map((index) => ({
    index,
    label: formatDate(result.dates[index]!, long),
  }));
  const lines: LaidOutLine[] = series.map(({ line, color, benchmark }) => {
    const points = line.changes.map((value, index) => ({
      x: x(index),
      y: y(value),
    }));
    const end = points.at(-1)!;
    return {
      symbol: line.symbol,
      color,
      benchmark,
      points,
      end,
      label: {
        y: end.y,
        text: labelValues
          ? `${line.symbol} ${formatChange(line.total)}`
          : line.symbol,
      },
    };
  });
  // Keep end labels at least one line apart, inside the plot height.
  const ordered = [...lines].sort((a, b) => a.label.y - b.label.y);
  ordered.forEach((line, index) => {
    const above = ordered[index - 1];
    line.label.y = Math.max(line.label.y, top + 4);
    if (above) line.label.y = Math.max(line.label.y, above.label.y + 14);
  });
  const overflow = (ordered.at(-1)?.label.y ?? 0) - (bottom + 4);
  if (overflow > 0) for (const line of ordered) line.label.y -= overflow;
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    x,
    y,
    yTicks,
    xTicks,
    lines,
  };
}
