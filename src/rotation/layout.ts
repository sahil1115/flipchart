import type { Quadrant, RotationResult } from './rotation';

export const quadrantInfo: Record<
  Quadrant,
  { name: string; color: string; hint: string }
> = {
  leading: {
    name: 'Leading',
    color: '#1f9d55',
    hint: 'Beating the market and getting stronger',
  },
  weakening: {
    name: 'Weakening',
    color: '#c98a00',
    hint: 'Beating the market, but fading',
  },
  lagging: {
    name: 'Lagging',
    color: '#d64545',
    hint: 'Trailing the market and getting weaker',
  },
  improving: {
    name: 'Improving',
    color: '#2f6fd6',
    hint: 'Trailing the market, but recovering',
  },
};

export const chartSize = { width: 780, height: 500 };

export interface Margin {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface LaidOutSector {
  label: string;
  quadrant: Quadrant;
  path: { x: number; y: number }[];
  end: { x: number; y: number };
  text: { x: number; y: number; anchor: 'start' | 'end' };
}
export interface Plot {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  x: (value: number) => number;
  y: (value: number) => number;
  sectors: LaidOutSector[];
}

const steps = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
/** The smallest round tick step that keeps at most four ticks per side. */
export const niceStep = (extent: number) =>
  steps.find((step) => extent / step <= 4) ?? steps.at(-1)!;

/** A symmetric axis around 100 that fits every point with a little room. */
function axis(deviations: number[]) {
  const extent = Math.max(0.5, ...deviations) * 1.15;
  const step = niceStep(extent);
  const half = Math.ceil(extent / step) * step;
  const ticks: number[] = [];
  for (let i = -half / step; i <= half / step + 1e-9; i++)
    ticks.push(Number((100 + i * step).toFixed(4)));
  return { min: 100 - half, max: 100 + half, ticks };
}

/**
 * Positions for the rotation chart. The on-screen SVG and the exported image
 * both draw from this, so they always agree.
 */
export function plotLayout(
  result: RotationResult,
  width: number,
  height: number,
  margin: Margin = { left: 60, right: 28, top: 20, bottom: 52 },
): Plot {
  const points = result.sectors.flatMap((sector) => sector.points);
  const xAxis = axis(points.map((point) => Math.abs(point.ratio - 100)));
  const yAxis = axis(points.map((point) => Math.abs(point.momentum - 100)));
  const left = margin.left;
  const right = width - margin.right;
  const top = margin.top;
  const bottom = height - margin.bottom;
  const x = (value: number) =>
    left + ((value - xAxis.min) / (xAxis.max - xAxis.min)) * (right - left);
  const y = (value: number) =>
    bottom - ((value - yAxis.min) / (yAxis.max - yAxis.min)) * (bottom - top);
  const sectors: LaidOutSector[] = result.sectors.map((sector) => {
    const path = sector.points.map((point) => ({
      x: x(point.ratio),
      y: y(point.momentum),
    }));
    const end = path.at(-1)!;
    const flip = end.x > right - 90;
    return {
      label: sector.label,
      quadrant: sector.quadrant,
      path,
      end,
      text: {
        x: end.x + (flip ? -10 : 10),
        y: end.y + 4,
        anchor: flip ? 'end' : 'start',
      },
    };
  });
  // Nudge labels that would sit on top of each other.
  const ordered = [...sectors].sort((a, b) => a.text.y - b.text.y);
  ordered.forEach((sector, index) => {
    const above = ordered[index - 1];
    if (above && Math.abs(sector.text.x - above.text.x) < 90)
      sector.text.y = Math.max(sector.text.y, above.text.y + 14);
    sector.text.y = Math.min(sector.text.y, bottom - 4);
  });
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    xMin: xAxis.min,
    xMax: xAxis.max,
    yMin: yAxis.min,
    yMax: yAxis.max,
    xTicks: xAxis.ticks,
    yTicks: yAxis.ticks,
    x,
    y,
    sectors,
  };
}

export const formatReading = (value: number) => value.toFixed(2);
