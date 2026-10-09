export interface ThemeDefinition {
  id: string;
  name: string;
  css: Record<`--${string}`, string>;
  chart: {
    background: string;
    text: string;
    grid: string;
    border: string;
    crosshair: string;
    positive: string;
    negative: string;
    accent: string;
    areaTop: string;
    areaBottom: string;
  };
}
export const glassLight: ThemeDefinition = {
  id: 'glass-light',
  name: 'Glass Light',
  css: {
    '--page-background':
      'linear-gradient(125deg, #e9f0fb 0%, #f2f3fb 48%, #eae6f7 100%)',
    '--surface': 'rgba(255, 255, 255, 0.72)',
    '--surface-opaque': '#ffffff',
    '--surface-elevated': '#f5f7fc',
    '--plot': '#fcfdff',
    '--border': '#d5ddeb',
    '--text': '#202d46',
    '--muted-text': '#56647b',
    '--accent': '#3456bb',
    '--accent-soft': '#edf1fd',
    '--positive': '#08765b',
    '--negative': '#b63750',
    '--focus-ring': '#3456bb',
    '--shadow': '0 8px 32px rgba(43, 59, 102, 0.06)',
    '--radius': '20px',
    '--control-radius': '9px',
    '--space': '8px',
    '--on-accent': '#ffffff',
  },
  chart: {
    background: '#fcfdff',
    text: '#56647b',
    grid: '#e8edf5',
    border: '#d5ddeb',
    crosshair: '#56647b',
    positive: '#08765b',
    negative: '#b63750',
    accent: '#3456bb',
    areaTop: 'rgba(52,86,187,0.26)',
    areaBottom: 'rgba(52,86,187,0.02)',
  },
};
export const themes: Readonly<Record<string, ThemeDefinition>> = {
  [glassLight.id]: glassLight,
};
export const resolveTheme = (id: string): ThemeDefinition =>
  themes[id] ?? glassLight;
export function applyTheme(theme: ThemeDefinition, reducedEffects: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.reducedEffects = String(reducedEffects);
  for (const [key, value] of Object.entries(theme.css))
    root.style.setProperty(key, value);
}
