import { resolveTheme } from '../themes/themes';
export interface ThemePreference {
  version: 1;
  themeId: string;
  reducedEffects: boolean;
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
