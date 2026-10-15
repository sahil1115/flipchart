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

export function formatCorrelation(value: number | null) {
  if (value === null) return '–';
  const text = value.toFixed(2);
  // A tiny negative rounds to "-0.00"; show it as zero.
  return text === '-0.00' ? '0.00' : text.replace('-', '−');
}
