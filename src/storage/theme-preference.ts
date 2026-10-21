import { resolveTheme, terminalAccents } from '../themes/themes';
import type { TerminalPreference } from '../themes/themes';
import { heatmapPalettes } from '../correlation/heatmap';
import type { HeatmapPalette } from '../correlation/heatmap';
export interface ThemePreference {
  version: 1;
  themeId: string;
  reducedEffects: boolean;
  terminal?: TerminalPreference;
  /** Correlation heatmap colours; blue/orange when absent. */
  heatmapPalette?: HeatmapPalette;
}
const key = 'flipchart:appearance';
export function readThemePreference(): ThemePreference {
  const fallback: ThemePreference = {
    version: 1,
    themeId: 'glass-light',
    reducedEffects: false,
  };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      typeof saved !== 'object' ||
      saved === null ||
      !('version' in saved) ||
      saved.version !== 1
    )
      return fallback;
    if (
      !('themeId' in saved) ||
      typeof saved.themeId !== 'string' ||
      !('reducedEffects' in saved) ||
      typeof saved.reducedEffects !== 'boolean'
    )
      return fallback;
    return {
      version: 1,
      themeId: resolveTheme(saved.themeId).id,
      reducedEffects: saved.reducedEffects,
      ...('heatmapPalette' in saved &&
      heatmapPalettes.includes(saved.heatmapPalette as HeatmapPalette)
        ? { heatmapPalette: saved.heatmapPalette as HeatmapPalette }
        : {}),
      ...('terminal' in saved &&
      typeof saved.terminal === 'object' &&
      saved.terminal !== null &&
      'mode' in saved.terminal &&
      (saved.terminal.mode === 'dark' || saved.terminal.mode === 'white') &&
      'accent' in saved.terminal &&
      typeof saved.terminal.accent === 'string' &&
      Object.hasOwn(terminalAccents, saved.terminal.accent)
        ? {
            terminal: {
              mode: saved.terminal.mode,
              accent: saved.terminal.accent as TerminalPreference['accent'],
            },
          }
        : {}),
    };
  } catch {
    return fallback;
  }
}
export function writeThemePreference(preference: ThemePreference): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}
