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
      'radial-gradient(ellipse at 7% 9%, #b3dce9 0%, transparent 48%), radial-gradient(ellipse at 90% 7%, #d8cdf4 0%, transparent 43%), radial-gradient(ellipse at 76% 64%, #bce9dc 0%, transparent 46%), radial-gradient(ellipse at 12% 88%, #f3d3de 0%, transparent 42%), linear-gradient(135deg, #edf4fa, #f4f2fb 56%, #e9f5f8)',
    '--surface': 'rgba(255, 255, 255, 0.38)',
    '--surface-opaque': '#f6faff',
    '--surface-elevated': 'rgba(255, 255, 255, 0.56)',
    '--plot': 'rgba(255, 255, 255, 0.68)',
    '--border': 'rgba(115, 141, 177, 0.40)',
    '--text': '#203047',
    '--muted-text': '#465871',
    '--accent': '#2855a6',
    '--accent-soft': '#dce9fb',
    '--positive': '#2f7d6d',
    '--negative': '#a34c4c',
    '--focus-ring': '#2855a6',
    '--shadow':
      '0 14px 34px -16px rgba(45,65,105,0.28), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.48)',
    '--radius': '24px',
    '--control-radius': '12px',
    '--space': '8px',
    '--on-accent': '#ffffff',
    '--control-shadow': 'none',
    '--inset-shadow': 'none',
    '--pressed-shadow': 'none',
    '--theme-font-family': "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  chart: {
    background: 'rgba(255, 255, 255, 0.68)',
    text: '#465871',
    grid: 'rgba(91,117,157,0.16)',
    border: 'rgba(115,141,177,0.40)',
    crosshair: '#587aa5',
    positive: '#2f7d6d',
    negative: '#a34c4c',
    accent: '#2855a6',
    areaTop: 'rgba(40,85,166,0.20)',
    areaBottom: 'rgba(40,85,166,0.01)',
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
export const frostedMono: ThemeDefinition = {
  id: 'frosted-mono',
  name: 'Frosted Mono',
  colorScheme: 'light',
  css: {
    ...glassLight.css,
    '--page-background':
      'radial-gradient(ellipse at 8% 14%, #d9e8f1 0%, transparent 42%), radial-gradient(ellipse at 85% 30%, #ded5c7 0%, transparent 42%), linear-gradient(135deg, #f5f3ef, #e7e5df 55%, #eef2f3)',
    '--surface': 'rgba(250, 249, 246, 0.64)',
    '--surface-opaque': '#f4f3ef',
    '--surface-elevated': '#e9e8e4',
    '--plot': '#f3f2ee',
    '--border': '#c9c9c4',
    '--text': '#24282b',
    '--muted-text': '#555b60',
    '--accent': '#303438',
    '--accent-soft': '#e1e2df',
    '--positive': '#326553',
    '--negative': '#8d4652',
    '--focus-ring': '#303438',
    '--shadow':
      '0 16px 40px rgba(42, 45, 47, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
    '--control-shadow': '0 3px 9px rgba(42, 45, 47, 0.07)',
    '--radius': '24px',
    '--control-radius': '14px',
  },
  chart: {
    background: '#f3f2ee',
    text: '#555b60',
    grid: '#dfe0db',
    border: '#c9c9c4',
    crosshair: '#555b60',
    positive: '#303438',
    negative: '#7d847e',
    accent: '#25292d',
    areaTop: 'rgba(37,41,45,0.32)',
    areaBottom: 'rgba(37,41,45,0.02)',
  },
};
export const oceanBlue: ThemeDefinition = {
  id: 'ocean-blue',
  name: 'Ocean Blue',
  colorScheme: 'light',
  css: {
    ...glassLight.css,
    '--page-background':
      'radial-gradient(ellipse at 0% 0%, #badbff 0%, transparent 48%), radial-gradient(ellipse at 100% 70%, #c6f0f4 0%, transparent 46%), linear-gradient(140deg, #e9f3ff, #dceafe)',
    '--surface': 'rgba(239, 247, 255, 0.88)',
    '--surface-opaque': '#f2f8ff',
    '--surface-elevated': '#e4effd',
    '--plot': '#edf6ff',
    '--border': '#b4cce8',
    '--text': '#183960',
    '--muted-text': '#49678d',
    '--accent': '#175fc4',
    '--accent-soft': '#d7e7ff',
    '--positive': '#08796d',
    '--negative': '#ae3652',
    '--focus-ring': '#175fc4',
    '--shadow':
      '0 2px 4px rgba(21,73,130,0.04), 0 12px 30px rgba(21,73,130,0.10)',
    '--radius': '22px',
    '--control-radius': '11px',
  },
  chart: {
    background: '#edf6ff',
    text: '#49678d',
    grid: '#d7e6f5',
    border: '#b4cce8',
    crosshair: '#41638e',
    positive: '#08796d',
    negative: '#ae3652',
    accent: '#175fc4',
    areaTop: 'rgba(23,95,196,0.24)',
    areaBottom: 'rgba(23,95,196,0.02)',
  },
};
export const plumNoir: ThemeDefinition = {
  id: 'plum-noir',
  name: 'Plum Noir',
  colorScheme: 'dark',
  css: {
    ...glassLight.css,
    '--page-background':
      'radial-gradient(ellipse at 5% 0%, #493047 0%, transparent 48%), radial-gradient(ellipse at 100% 90%, #3b2944 0%, transparent 44%), linear-gradient(145deg, #211a2b, #17121e)',
    '--surface': 'rgba(43, 34, 54, 0.90)',
    '--surface-opaque': '#2b2236',
    '--surface-elevated': '#34283e',
    '--plot': '#221c2d',
    '--border': '#594560',
    '--text': '#f1eaf7',
    '--muted-text': '#bfb1cb',
    '--accent': '#f4bc7a',
    '--accent-soft': '#443040',
    '--positive': '#90d7b4',
    '--negative': '#f2a0b6',
    '--focus-ring': '#f4bc7a',
    '--on-accent': '#291b14',
    '--shadow': '0 2px 6px rgba(10,6,15,0.18), 0 18px 40px rgba(10,6,15,0.30)',
    '--radius': '18px',
    '--control-radius': '9px',
    '--control-shadow': 'inset 0 1px 0 rgba(255,227,184,0.05)',
  },
  chart: {
    background: '#221c2d',
    text: '#bfb1cb',
    grid: '#3d324c',
    border: '#594560',
    crosshair: '#d095b5',
    positive: '#90d7b4',
    negative: '#f2a0b6',
    accent: '#f4bc7a',
    areaTop: 'rgba(244,188,122,0.22)',
    areaBottom: 'rgba(244,188,122,0.01)',
  },
};
/** Ruled notebook paper, black-ink handwriting and yellow highlighter. */
export const notebookFont = 'Patrick Hand';
export const notebook: ThemeDefinition = {
  id: 'notebook',
  name: 'Notebook',
  colorScheme: 'light',
  css: {
    ...glassLight.css,
    '--page-background':
      'linear-gradient(90deg, transparent 54px, #e8a3a3 54px, #e8a3a3 56px, transparent 56px), repeating-linear-gradient(#fbfaf5 0 27px, #c9d8ee 27px 28px), #fbfaf5',
    '--surface': '#fffef9',
    '--surface-opaque': '#fdfcf6',
    '--surface-elevated': '#f6f3e7',
    '--plot': '#fffef9',
    '--border': 'rgba(43, 43, 43, 0.22)',
    '--text': '#1e1f22',
    '--muted-text': '#4f5560',
    '--accent': '#1f4fa3',
    '--accent-soft': '#fff3a3',
    '--positive': '#2e7d32',
    '--negative': '#c62828',
    '--focus-ring': '#1f4fa3',
    '--on-accent': '#ffffff',
    '--shadow': '0 1px 0 rgba(0,0,0,0.08), 0 8px 18px -12px rgba(0,0,0,0.25)',
    '--control-shadow': 'none',
    '--radius': '6px',
    '--control-radius': '8px',
    '--theme-font-family': `'${notebookFont}', 'Segoe Print', 'Comic Sans MS', cursive`,
  },
  chart: {
    background: '#fffef9',
    text: '#4f5560',
    grid: '#d6e1f2',
    border: '#c9cfd8',
    crosshair: '#1f4fa3',
    positive: '#2e7d32',
    negative: '#c62828',
    accent: '#1e1f22',
    areaTop: 'rgba(30,31,34,0.14)',
    areaBottom: 'rgba(30,31,34,0.01)',
  },
};
export const terminalAccents = {
  yellow: { name: 'Solar Yellow', dark: '#ffe566', white: '#806600' },
  gold: { name: 'Heritage Gold', dark: '#ffb74d', white: '#946200' },
  blue: { name: 'Electric Blue', dark: '#69b5ff', white: '#1156b5' },
  green: { name: 'Emerald Green', dark: '#73e29c', white: '#126b38' },
  pink: { name: 'Rose Pink', dark: '#ff8ec7', white: '#a52068' },
  purple: { name: 'Royal Purple', dark: '#c49bff', white: '#6b38b2' },
  monochrome: { name: 'Pure Contrast', dark: '#ffffff', white: '#000000' },
} as const;
export interface TerminalPreference {
  mode: 'dark' | 'white';
  accent: keyof typeof terminalAccents;
}
export const defaultTerminalPreference: TerminalPreference = {
  mode: 'dark',
  accent: 'gold',
};
export function terminalTheme(
  preference: TerminalPreference = defaultTerminalPreference,
): ThemeDefinition {
  const dark = preference.mode === 'dark';
  const background = dark ? '#000000' : '#ffffff';
  const accent = terminalAccents[preference.accent][preference.mode];
  const rgb = accent
    .slice(1)
    .match(/../g)!
    .map((pair) => parseInt(pair, 16))
    .join(',');
  const muted = dark ? '#b8b8b8' : '#595959';
  const border = dark ? '#454545' : '#c7c7c7';
  const positive = dark ? '#64df9b' : '#126b38';
  const negative = dark ? '#ff91b4' : '#ae214e';
  return {
    id: 'terminal-amber',
    name: 'Terminal',
    colorScheme: dark ? 'dark' : 'light',
    css: {
      ...glassLight.css,
      '--page-background': background,
      '--surface': background,
      '--surface-opaque': background,
      '--surface-elevated': background,
      '--plot': background,
      '--border': border,
      '--text': accent,
      '--muted-text': muted,
      '--accent': accent,
      '--accent-soft': background,
      '--positive': positive,
      '--negative': negative,
      '--focus-ring': accent,
      '--on-accent': background,
      '--shadow': 'none',
      '--radius': '3px',
      '--control-radius': '2px',
      '--theme-font-family': "Consolas, 'Liberation Mono', Menlo, monospace",
    },
    chart: {
      background,
      text: muted,
      border,
      grid: dark ? '#212121' : '#e4e4e4',
      crosshair: dark ? '#d0d0d0' : '#626262',
      positive,
      negative,
      accent,
      areaTop: `rgba(${rgb},0.20)`,
      areaBottom: `rgba(${rgb},0.01)`,
    },
  };
}
export const terminalAmber = terminalTheme();
export const themes: Readonly<Record<string, ThemeDefinition>> = {
  [glassLight.id]: glassLight,
  [softClay.id]: softClay,
  [midnightClay.id]: midnightClay,
  [frostedMono.id]: frostedMono,
  [oceanBlue.id]: oceanBlue,
  [plumNoir.id]: plumNoir,
  [notebook.id]: notebook,
  [terminalAmber.id]: terminalAmber,
};
export const resolveTheme = (
  id: string,
  terminal?: TerminalPreference,
): ThemeDefinition =>
  id === terminalAmber.id
    ? terminalTheme(terminal)
    : (themes[id] ?? glassLight);
/**
 * Canvas charts measure label widths once, so a theme's web font must be loaded
 * before they draw with it. Resolves (never rejects) once the font is usable.
 */
export function loadThemeFont(theme: ThemeDefinition): Promise<void> {
  if (
    theme.id !== notebook.id ||
    typeof document === 'undefined' ||
    !document.fonts
  )
    return Promise.resolve();
  return document.fonts.load(`16px '${notebookFont}'`).then(
    () => undefined,
    () => undefined,
  );
}
export function themeFontReady(theme: ThemeDefinition): boolean {
  return (
    theme.id !== notebook.id ||
    typeof document === 'undefined' ||
    !document.fonts ||
    document.fonts.check(`16px '${notebookFont}'`)
  );
}
export function applyTheme(theme: ThemeDefinition, reducedEffects: boolean) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.colorScheme;
  root.dataset.reducedEffects = String(reducedEffects);
  for (const [key, value] of Object.entries(theme.css))
    root.style.setProperty(key, value);
}
