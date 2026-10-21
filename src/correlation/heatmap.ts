export type HeatmapPalette = 'blue-orange' | 'green-red';
export const heatmapPalettes: HeatmapPalette[] = ['blue-orange', 'green-red'];

/**
 * Blue/orange is the default because it stays distinguishable without telling
 * red from green; green/red is offered for readers who prefer it. Cells always
 * print their value, so colour is never the only signal.
 */
const palettes = {
  'blue-orange': {
    positive: { hue: 214, saturation: 68 },
    negative: { hue: 27, saturation: 82 },
    darkest: 38,
  },
  // A slightly darker end keeps white values readable on strong cells.
  'green-red': {
    positive: { hue: 142, saturation: 60 },
    negative: { hue: 3, saturation: 72 },
    darkest: 32,
  },
} as const;

const tone = (
  palette: HeatmapPalette,
  positive: boolean,
  lightness: number,
) => {
  const { hue, saturation } =
    palettes[palette][positive ? 'positive' : 'negative'];
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export function cellColors(
  value: number | null,
  palette: HeatmapPalette = 'blue-orange',
) {
  if (value === null)
    return { background: 'var(--surface-opaque)', color: 'var(--muted-text)' };
  const strength = Math.min(1, Math.abs(value));
  const lightness = 96 - strength * (96 - palettes[palette].darkest);
  return {
    background: tone(palette, value >= 0, lightness),
    color: lightness < 60 ? '#ffffff' : '#1b2430',
  };
}

/** The −1 … +1 legend bar for a palette. */
export function legendGradient(palette: HeatmapPalette = 'blue-orange') {
  const { darkest } = palettes[palette];
  return `linear-gradient(to right, ${tone(palette, false, darkest)}, ${tone(palette, false, 96)}, ${tone(palette, true, 96)}, ${tone(palette, true, darkest)})`;
}

export function formatCorrelation(value: number | null) {
  if (value === null) return '–';
  const text = value.toFixed(2);
  // A tiny negative rounds to "-0.00"; show it as zero.
  return text === '-0.00' ? '0.00' : text.replace('-', '−');
}
