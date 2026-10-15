/** Blue for positive, orange for negative: distinguishable without red/green. */
export function cellColors(value: number | null) {
  if (value === null)
    return { background: 'var(--surface-opaque)', color: 'var(--muted-text)' };
  const strength = Math.min(1, Math.abs(value));
  const lightness = 96 - strength * 58;
  return {
    background: `hsl(${value >= 0 ? 214 : 27} ${value >= 0 ? 68 : 82}% ${lightness}%)`,
    color: lightness < 60 ? '#ffffff' : '#1b2430',
  };
}

export const formatCorrelation = (value: number | null) =>
  value === null ? '–' : value.toFixed(2).replace('-', '−');
