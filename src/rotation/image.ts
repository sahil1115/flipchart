import { chartSize as chart, plotLayout, quadrantInfo } from './layout';
import type { RotationResult } from './rotation';

export interface RotationImage {
  title: string;
  subtitle: string;
  footer: string;
  result: RotationResult;
}

/** A fixed light palette: exported images sit on white pages in documents. */
const ink = {
  background: '#ffffff',
  text: '#1b2430',
  muted: '#5b6b80',
  border: '#d5dce6',
  grid: '#e4e9f0',
  accent: '#2855a6',
};
const pad = 28;

/**
 * Draws the branded sector-rotation card at `scale`× resolution from data (not
 * a page capture), so it is crisp, theme-independent and CSP-safe.
 */
export function drawRotation(
  input: RotationImage,
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
        chart.width,
        measure(input.title, 18, 700) + 32 + brandWidth,
        measure(input.subtitle, 13) + 32 + brandWidth,
        measure(input.footer, 11),
      ),
  );
  const headerHeight = 64;
  const top = pad + headerHeight;
  const height = Math.ceil(top + chart.height + 18 + 14 + pad);
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

  // The chart, laid out by the same function the page uses.
  const plot = plotLayout(input.result, chart.width, chart.height);
  context.save();
  context.translate(Math.round((width - chart.width) / 2), top);
  const midX = plot.x(100);
  const midY = plot.y(100);
  const quadrants = [
    ['improving', plot.left, plot.top, midX, midY],
    ['leading', midX, plot.top, plot.right, midY],
    ['lagging', plot.left, midY, midX, plot.bottom],
    ['weakening', midX, midY, plot.right, plot.bottom],
  ] as const;
  for (const [id, x0, y0, x1, y1] of quadrants) {
    context.fillStyle = `${quadrantInfo[id].color}1a`;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  context.lineWidth = 1;
  context.strokeStyle = ink.grid;
  context.fillStyle = ink.muted;
  context.font = font(11);
  context.textAlign = 'center';
  for (const tick of plot.xTicks) {
    context.beginPath();
    context.moveTo(plot.x(tick), plot.top);
    context.lineTo(plot.x(tick), plot.bottom);
    context.stroke();
    context.fillText(String(tick), plot.x(tick), plot.bottom + 14);
  }
  context.textAlign = 'right';
  for (const tick of plot.yTicks) {
    context.beginPath();
    context.moveTo(plot.left, plot.y(tick));
    context.lineTo(plot.right, plot.y(tick));
    context.stroke();
    context.fillText(String(tick), plot.left - 8, plot.y(tick));
  }
  context.strokeStyle = ink.muted;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(midX, plot.top);
  context.lineTo(midX, plot.bottom);
  context.moveTo(plot.left, midY);
  context.lineTo(plot.right, midY);
  context.stroke();
  context.fillStyle = ink.muted;
  context.font = font(12, 600);
  context.textAlign = 'center';
  context.fillText(
    'RS-Ratio: trend against the benchmark →',
    (plot.left + plot.right) / 2,
    plot.bottom + 36,
  );
  context.save();
  context.translate(16, (plot.top + plot.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText('RS-Momentum: is it improving? →', 0, 0);
  context.restore();
  context.font = font(13, 700);
  const corners = [
    ['improving', plot.left + 10, plot.top + 14, 'left'],
    ['leading', plot.right - 10, plot.top + 14, 'right'],
    ['lagging', plot.left + 10, plot.bottom - 14, 'left'],
    ['weakening', plot.right - 10, plot.bottom - 14, 'right'],
  ] as const;
  for (const [id, x, y, align] of corners) {
    context.fillStyle = quadrantInfo[id].color;
    context.textAlign = align;
    context.fillText(quadrantInfo[id].name.toUpperCase(), x, y);
  }
  for (const sector of plot.sectors) {
    const color = quadrantInfo[sector.quadrant].color;
    context.strokeStyle = `${color}99`;
    context.lineWidth = 2;
    context.beginPath();
    sector.path.forEach((point, index) =>
      index
        ? context.lineTo(point.x, point.y)
        : context.moveTo(point.x, point.y),
    );
    context.stroke();
    context.fillStyle = `${color}99`;
    for (const point of sector.path.slice(0, -1)) {
      context.beginPath();
      context.arc(point.x, point.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = color;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(sector.end.x, sector.end.y, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = ink.text;
    context.font = font(12, 700);
    context.textAlign = sector.text.anchor === 'end' ? 'right' : 'left';
    context.fillText(sector.label, sector.text.x, sector.text.y);
  }
  context.restore();

  context.textAlign = 'center';
  context.fillStyle = ink.muted;
  context.font = font(11);
  context.fillText(input.footer, width / 2, top + chart.height + 24);
  return canvas;
}
