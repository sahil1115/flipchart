import { cellColors, formatCorrelation } from './heatmap';
import type { HeatmapPalette } from './heatmap';

export interface HeatmapImage {
  title: string;
  subtitle: string;
  footer: string;
  symbols: string[];
  matrix: (number | null)[][];
  palette?: HeatmapPalette;
}

/** A fixed light palette: exported images sit on white pages in documents. */
const ink = {
  background: '#ffffff',
  text: '#1b2430',
  muted: '#5b6b80',
  border: '#d5dce6',
  empty: '#eef1f5',
  accent: '#2855a6',
};
const cell = { width: 58, height: 40, gap: 3, radius: 6 };
const pad = 28;

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

/**
 * Draws the branded heatmap card at `scale`× resolution. Drawn from data, not
 * captured from the page, so it is crisp, theme-independent and CSP-safe.
 */
export function drawHeatmap(
  input: HeatmapImage,
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
  const count = input.symbols.length;
  const labelWidth =
    Math.max(...input.symbols.map((symbol) => measure(symbol, 13, 600))) + 14;
  const gridWidth = count * cell.width + (count - 1) * cell.gap;
  const brand = 'Prepared by ';
  const brandWidth =
    24 + 8 + measure(brand, 13) + measure('FlipChart', 13, 700);
  const width = Math.ceil(
    pad * 2 +
      Math.max(
        labelWidth + gridWidth,
        measure(input.title, 18, 700) + 32 + brandWidth,
        measure(input.subtitle, 13) + 32 + brandWidth,
        measure(input.footer, 11),
      ),
  );
  const headerHeight = 64;
  const columnLabels = labelWidth;
  const top = pad + headerHeight + columnLabels;
  const gridHeight = count * cell.height + (count - 1) * cell.gap;
  const height = Math.ceil(top + gridHeight + 24 + 14 + 24 + 16 + pad);
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

  // Header: title and subtitle on the left, brand on the right.
  context.textAlign = 'left';
  context.fillStyle = ink.text;
  context.font = font(18, 700);
  context.fillText(input.title, pad, pad + 10);
  context.fillStyle = ink.muted;
  context.font = font(13);
  context.fillText(input.subtitle, pad, pad + 36);
  const brandX = width - pad - brandWidth;
  context.fillStyle = ink.accent;
  roundRect(context, brandX, pad - 2, 24, 24, 7);
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

  const left = Math.round((width - labelWidth - gridWidth) / 2) + labelWidth;
  // Column labels, rotated to read bottom-up like the on-screen table.
  context.fillStyle = ink.text;
  context.font = font(13, 600);
  input.symbols.forEach((symbol, j) => {
    context.save();
    context.translate(
      left + j * (cell.width + cell.gap) + cell.width / 2,
      top - 8,
    );
    context.rotate(-Math.PI / 2);
    context.textAlign = 'left';
    context.fillText(symbol, 0, 0);
    context.restore();
  });
  // Rows: label, then coloured cells with their values.
  input.matrix.forEach((row, i) => {
    const y = top + i * (cell.height + cell.gap);
    context.textAlign = 'right';
    context.fillStyle = ink.text;
    context.font = font(13, 600);
    context.fillText(input.symbols[i]!, left - 10, y + cell.height / 2);
    row.forEach((value, j) => {
      const x = left + j * (cell.width + cell.gap);
      const colors = cellColors(value, input.palette);
      context.fillStyle = value === null ? ink.empty : colors.background;
      roundRect(context, x, y, cell.width, cell.height, cell.radius);
      context.fillStyle = value === null ? ink.muted : colors.color;
      context.font = font(13, i === j ? 600 : 400);
      context.textAlign = 'center';
      context.fillText(
        formatCorrelation(value),
        x + cell.width / 2,
        y + cell.height / 2,
      );
    });
  });

  // Legend: −1 … +1 on the same scale as the cells.
  const legendY = top + gridHeight + 24;
  const legendWidth = Math.min(280, gridWidth - 60);
  const legendX = left + (gridWidth - legendWidth) / 2;
  const gradient = context.createLinearGradient(
    legendX,
    0,
    legendX + legendWidth,
    0,
  );
  gradient.addColorStop(0, cellColors(-1, input.palette).background);
  gradient.addColorStop(0.5, cellColors(0, input.palette).background);
  gradient.addColorStop(1, cellColors(1, input.palette).background);
  context.fillStyle = gradient;
  roundRect(context, legendX, legendY, legendWidth, 12, 6);
  context.fillStyle = ink.muted;
  context.font = font(12);
  context.textAlign = 'right';
  context.fillText('−1', legendX - 8, legendY + 6);
  context.textAlign = 'left';
  context.fillText('+1', legendX + legendWidth + 8, legendY + 6);

  context.textAlign = 'center';
  context.font = font(11);
  context.fillText(input.footer, width / 2, legendY + 12 + 24);
  return canvas;
}

export function canvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Image encoding failed')),
      type,
      0.95,
    ),
  );
}
