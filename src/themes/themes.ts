export interface ThemeDefinition {
  id: string;
  name: string;
  colorScheme: 'light' | 'dark';
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
  colorScheme: 'light',
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
    '--control-shadow': 'none',
    '--inset-shadow': 'none',
    '--pressed-shadow': 'none',
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
export const softClay: ThemeDefinition = {
  id: 'soft-clay',
  name: 'Soft Clay',
  colorScheme: 'light',
  css: {
    ...glassLight.css,
    '--page-background': '#e4e7eb',
    '--surface': '#e4e7eb',
    '--surface-opaque': '#e4e7eb',
    '--surface-elevated': '#e4e7eb',
    '--plot': '#e4e7eb',
    '--border': '#c2c9d1',
    '--text': '#293847',
    '--muted-text': '#536373',
    '--accent': '#2f6b9b',
    '--accent-soft': '#d4e2ed',
    '--positive': '#187356',
    '--negative': '#a93650',
    '--focus-ring': '#2f6b9b',
    '--shadow': '10px 10px 24px #c3c7cd, -10px -10px 24px #ffffff',
    '--control-shadow': '4px 4px 8px #c3c7cd, -4px -4px 8px #ffffff',
    '--inset-shadow': 'inset 4px 4px 8px #c3c7cd, inset -4px -4px 8px #ffffff',
    '--pressed-shadow':
      'inset 2px 2px 5px #245579, inset -2px -2px 5px #4685b4',
    '--radius': '24px',
    '--control-radius': '12px',
  },
  chart: {
    background: '#e4e7eb',
    text: '#536373',
    grid: '#d3d9df',
    border: '#bdc6cf',
    crosshair: '#536373',
    positive: '#187356',
    negative: '#a93650',
    accent: '#2f6b9b',
    areaTop: 'rgba(47,107,155,0.28)',
    areaBottom: 'rgba(47,107,155,0.02)',
  },
};
export const midnightClay: ThemeDefinition = {
  id: 'midnight-clay',
  name: 'Midnight Clay',
  colorScheme: 'dark',
  css: {
    ...softClay.css,
    '--page-background': '#232c3a',
    '--surface': '#232c3a',
    '--surface-opaque': '#232c3a',
    '--surface-elevated': '#232c3a',
    '--plot': '#232c3a',
    '--border': '#49576a',
    '--text': '#e5edf5',
    '--muted-text': '#acbccd',
    '--accent': '#88bceb',
    '--accent-soft': '#2c4056',
    '--positive': '#68c9a7',
    '--negative': '#f390a4',
    '--focus-ring': '#88bceb',
    '--on-accent': '#172a3c',
    '--shadow': '10px 10px 24px #171e28, -10px -10px 24px #2f3a4c',
    '--control-shadow': '4px 4px 8px #171e28, -4px -4px 8px #2f3a4c',
    '--inset-shadow': 'inset 4px 4px 8px #171e28, inset -4px -4px 8px #2f3a4c',
    '--pressed-shadow':
      'inset 2px 2px 5px #638fb6, inset -2px -2px 5px #a9d5fb',
  },
  chart: {
    background: '#232c3a',
    text: '#acbccd',
    grid: '#344152',
    border: '#49576a',
    crosshair: '#acbccd',
    positive: '#68c9a7',
    negative: '#f390a4',
    accent: '#88bceb',
    areaTop: 'rgba(136,188,235,0.30)',
    areaBottom: 'rgba(136,188,235,0.02)',
  },
};
export const themes: Readonly<Record<string, ThemeDefinition>> = {
  [glassLight.id]: glassLight,
  [softClay.id]: softClay,
  [midnightClay.id]: midnightClay,
};
export const resolveTheme = (id: string): ThemeDefinition =>
  themes[id] ?? glassLight;
export function applyTheme(theme: ThemeDefinition, reducedEffects: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.colorScheme;
  root.dataset.reducedEffects = String(reducedEffects);
  for (const [key, value] of Object.entries(theme.css))
    root.style.setProperty(key, value);
}
