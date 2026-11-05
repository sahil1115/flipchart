import { cellColors } from '../correlation/heatmap';
import type { HeatmapPalette } from '../correlation/heatmap';
import { formatReturn, formatShare, monthNames } from './seasonality';
import type { SeasonalityResult } from './seasonality';

export interface SeasonalityImage {
  title: string;
  subtitle: string;
  footer: string;
  result: SeasonalityResult;
  /** Percent at which a cell reaches its strongest colour. */
  scale: number;
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
const cell = { width: 50, height: 28, gap: 3, radius: 5 };
const pad = 28;

/**
 * Draws the branded monthly-returns card at `scale`× resolution from data (not
 * a page capture), so it is crisp, theme-independent and CSP-safe.
 */
export function drawSeasonality(
  input: SeasonalityImage,
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
  const { years, statistics } = input.result;
  /** Newest year first, as on the page. */
  const rows = [...years].reverse();
  const labelWidth = 64;
  const columns = 13; // twelve months and the year
  const step = cell.width + cell.gap;
  const gridWidth = columns * step - cell.gap + 6;
  const brand = 'Prepared by ';
  const brandWidth =
    24 + 8 + measure(brand, 13) + measure('FlipChart', 13, 700);
  const note = 'Dashed outline: month still in progress, not counted above.';
  const width = Math.ceil(
    pad * 2 +
      Math.max(
        labelWidth + gridWidth,
        measure(input.title, 18, 700) + 32 + brandWidth,
        measure(input.subtitle, 13) + 32 + brandWidth,
        measure(input.footer, 11),
      ),
  );
  const rowHeight = cell.height + cell.gap;
  const headerTop = pad + 64;
  const bodyTop = headerTop + rowHeight;
  const statsTop = bodyTop + years.length * rowHeight + 8;
  const legendY = statsTop + 2 * rowHeight + 18;
  const hasPartial = years.some((entry) =>
    entry.months.some((month) => month.partial),
  );
  const height = Math.ceil(
    legendY + 12 + 18 + (hasPartial ? 16 : 0) + 14 + pad,
  );
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

  const left = Math.round((width - labelWidth - gridWidth) / 2) + labelWidth;
  const columnX = (column: number) =>
    left + column * step + (column === 12 ? 6 : 0);
  const draw = (
    column: number,
    y: number,
    text: string,
    value: number | null,
    options: { colour?: boolean; partial?: boolean; bold?: boolean } = {},
  ) => {
    const x = columnX(column);
    const colour = options.colour !== false && value !== null;
    const colors = cellColors(
      colour ? Math.max(-1, Math.min(1, value / input.scale)) : null,
      input.palette,
    );
    context.fillStyle = colour ? colors.background : ink.empty;
    context.beginPath();
    context.roundRect(x, y, cell.width, cell.height, cell.radius);
    context.fill();
    if (options.partial) {
      context.strokeStyle = ink.muted;
      context.lineWidth = 1.5;
      context.setLineDash([3, 2]);
      context.beginPath();
      context.roundRect(
        x + 0.75,
        y + 0.75,
        cell.width - 1.5,
        cell.height - 1.5,
        cell.radius,
      );
      context.stroke();
      context.setLineDash([]);
    }
    context.fillStyle = colour ? colors.color : ink.muted;
    context.font = font(12, options.bold ? 700 : 400);
    context.textAlign = 'center';
    context.fillText(text, x + cell.width / 2, y + cell.height / 2);
  };

  context.fillStyle = ink.text;
  context.font = font(12, 600);
  context.textAlign = 'center';
  monthNames.forEach((name, month) =>
    context.fillText(
      name,
      columnX(month) + cell.width / 2,
      headerTop + cell.height / 2,
    ),
  );
  context.fillText(
    'Year',
    columnX(12) + cell.width / 2,
    headerTop + cell.height / 2,
  );
  rows.forEach((entry, index) => {
    const y = bodyTop + index * rowHeight;
    context.textAlign = 'right';
    context.fillStyle = ink.text;
    context.font = font(12, 600);
    context.fillText(String(entry.year), left - 10, y + cell.height / 2);
    entry.months.forEach((month, column) =>
      draw(column, y, formatReturn(month.value), month.value, {
        partial: month.partial,
      }),
    );
    draw(12, y, formatReturn(entry.total), entry.total, {
      partial: entry.partial && entry.total !== null,
      bold: true,
    });
  });
  const labels = ['Average', 'Up months'];
  labels.forEach((label, index) => {
    const y = statsTop + index * rowHeight;
    context.textAlign = 'right';
    context.fillStyle = ink.text;
    context.font = font(12, 600);
    context.fillText(label, left - 10, y + cell.height / 2);
    statistics.forEach((stat, column) =>
      index === 0
        ? draw(column, y, formatReturn(stat.average), stat.average, {
            bold: true,
          })
        : draw(column, y, formatShare(stat.upShare), stat.upShare, {
            colour: false,
          }),
    );
  });

  // Legend: the same colour scale as the cells.
  const legendWidth = 240;
  const legendX = Math.round(left + (gridWidth - legendWidth) / 2);
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
  context.beginPath();
  context.roundRect(legendX, legendY, legendWidth, 12, 6);
  context.fill();
  context.fillStyle = ink.muted;
  context.font = font(12);
  context.textAlign = 'right';
  context.fillText(`−${input.scale}%`, legendX - 8, legendY + 6);
  context.textAlign = 'left';
  context.fillText(`+${input.scale}%`, legendX + legendWidth + 8, legendY + 6);

  context.textAlign = 'center';
  context.font = font(11);
  let lineY = legendY + 12 + 18;
  if (hasPartial) {
    context.fillText(note, width / 2, lineY);
    lineY += 16;
  }
  context.fillText(input.footer, width / 2, lineY);
  return canvas;
}
