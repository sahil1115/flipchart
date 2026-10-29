import { chartSize, performanceLayout } from './layout';
import { formatChange } from './performance';
import type { PerformanceResult } from './performance';

export interface PerformanceImage {
  title: string;
  subtitle: string;
  footer: string;
  result: PerformanceResult;
}

/** A fixed light palette: exported images sit on white pages in documents. */
const ink = {
  background: '#ffffff',
  text: '#1b2430',
  muted: '#5b6b80',
  border: '#d5dce6',
  grid: '#e4e9f0',
  axis: '#9aa6b5',
  accent: '#2855a6',
};
const pad = 28;

/**
 * Draws the branded comparison card at `scale`× resolution from data (not a
 * page capture), so it is crisp, theme-independent and CSP-safe.
 */
export function drawPerformance(
  input: PerformanceImage,
  scale = 2,
  fontFamily = "'Inter', 'Segoe UI', system-ui, sans-serif",
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = (size: number, weight = 400) =>
    `${weight} ${size}px ${fontFamily}`;
  const measure = (text: string, size: number, weight = 400) => {
    context.font = font(size, weight);
    return context.measureText(text).width;
  };
  const brand = 'Prepared by ';
  const brandWidth =
    24 + 8 + measure(brand, 13) + measure('FlipChart', 13, 700);
  const width = Math.ceil(
    pad * 2 +
      Math.max(
        chartSize.width,
        measure(input.title, 18, 700) + 32 + brandWidth,
        measure(input.subtitle, 13) + 32 + brandWidth,
        measure(input.footer, 11),
      ),
  );
  const top = pad + 64;
  const height = Math.ceil(top + chartSize.height + 16 + 14 + pad);
  canvas.width = width * scale;
  canvas.height = height * scale;
  context.scale(scale, scale);
  context.textBaseline = 'middle';

  context.fillStyle = ink.background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = ink.border;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(0.5, 0.5, width - 1, height - 1, 16);
  context.stroke();

  context.textAlign = 'left';
  context.fillStyle = ink.text;
  context.font = font(18, 700);
  context.fillText(input.title, pad, pad + 10);
  context.fillStyle = ink.muted;
  context.font = font(13);
  context.fillText(input.subtitle, pad, pad + 36);
  const brandX = width - pad - brandWidth;
  context.fillStyle = ink.accent;
  context.beginPath();
  context.roundRect(brandX, pad - 2, 24, 24, 7);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = font(15, 750);
  context.textAlign = 'center';
  context.fillText('F', brandX + 12, pad + 10);
  context.textAlign = 'left';
  context.fillStyle = ink.muted;
  context.font = font(13);
  context.fillText(brand, brandX + 32, pad + 10);
  context.fillStyle = ink.text;
  context.font = font(13, 700);
  context.fillText('FlipChart', brandX + 32 + measure(brand, 13), pad + 10);

  const plot = performanceLayout(
    input.result,
    chartSize.width,
    chartSize.height,
    'light',
  );
  context.save();
  context.translate(Math.round((width - chartSize.width) / 2), top);
  context.font = font(11);
  context.fillStyle = ink.muted;
  context.textAlign = 'right';
  for (const tick of plot.yTicks) {
    context.strokeStyle = tick === 0 ? ink.axis : ink.grid;
    context.lineWidth = tick === 0 ? 1.5 : 1;
    context.beginPath();
    context.moveTo(plot.left, plot.y(tick));
    context.lineTo(plot.right, plot.y(tick));
    context.stroke();
    context.fillText(
      formatChange(tick, Number.isInteger(tick) ? 0 : 1),
      plot.left - 8,
      plot.y(tick),
    );
  }
  plot.xTicks.forEach((tick, n) => {
    context.textAlign =
      n === 0 ? 'left' : n === plot.xTicks.length - 1 ? 'right' : 'center';
    context.fillText(tick.label, plot.x(tick.index), plot.bottom + 16);
  });
  context.lineJoin = 'round';
  context.lineCap = 'round';
  for (const line of plot.lines) {
    context.strokeStyle = line.color;
    context.lineWidth = 2;
    context.setLineDash(line.benchmark ? [6, 4] : []);
    context.beginPath();
    line.points.forEach((point, index) =>
      index
        ? context.lineTo(point.x, point.y)
        : context.moveTo(point.x, point.y),
    );
    context.stroke();
    context.setLineDash([]);
    if (line.label.y !== line.end.y) {
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(line.end.x, line.end.y);
      context.lineTo(plot.right + 6, line.label.y);
      context.stroke();
    }
    context.fillStyle = line.color;
    context.beginPath();
    context.arc(plot.right + 10, line.label.y, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ink.text;
    context.font = font(12, 600);
    context.textAlign = 'left';
    context.fillText(line.label.text, plot.right + 18, line.label.y);
  }
  context.restore();

  context.textAlign = 'center';
  context.fillStyle = ink.muted;
  context.font = font(11);
  context.fillText(input.footer, width / 2, top + chartSize.height + 22);
  return canvas;
}
