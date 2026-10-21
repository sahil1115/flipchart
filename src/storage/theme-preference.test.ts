// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readThemePreference, writeThemePreference } from './theme-preference';
import { resolveTheme } from '../themes/themes';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('restores terminal mode and accent while ignoring invalid terminal settings', () => {
  const preference = {
    version: 1 as const,
    themeId: 'terminal-amber',
    reducedEffects: true,
    terminal: { mode: 'white' as const, accent: 'purple' as const },
  };
  expect(writeThemePreference(preference)).toBe(true);
  expect(readThemePreference()).toEqual(preference);
  for (const terminal of [
    { mode: 'unknown', accent: 'gold' },
    { mode: 'dark', accent: 'unknown' },
    null,
  ]) {
    localStorage.setItem(
      'flipchart:appearance',
      JSON.stringify({ ...preference, terminal }),
    );
    expect(readThemePreference()).toEqual({
      version: 1,
      themeId: 'terminal-amber',
      reducedEffects: true,
    });
  }
});
it('accepts a versioned preference and falls back for future unknown IDs', () => {
  writeThemePreference({
    version: 1,
    themeId: 'future-theme',
    reducedEffects: true,
  });
  expect(readThemePreference()).toEqual({
    version: 1,
    themeId: 'glass-light',
    reducedEffects: true,
  });
  expect(resolveTheme('future-theme').id).toBe('glass-light');
});
it('recovers from invalid schemas and denied storage', () => {
  localStorage.setItem('flipchart:appearance', '{broken');
  expect(readThemePreference().themeId).toBe('glass-light');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readThemePreference().reducedEffects).toBe(false);
  expect(
    writeThemePreference({
      version: 1,
      themeId: 'glass-light',
      reducedEffects: true,
    }),
  ).toBe(false);
});

it('restores a chosen heatmap palette and ignores unknown ones', () => {
  const preference = {
    version: 1 as const,
    themeId: 'glass-light',
    reducedEffects: false,
    heatmapPalette: 'green-red' as const,
  };
  expect(writeThemePreference(preference)).toBe(true);
  expect(readThemePreference()).toEqual(preference);
  for (const heatmapPalette of ['rainbow', 7, null]) {
    localStorage.setItem(
      'flipchart:appearance',
      JSON.stringify({ ...preference, heatmapPalette }),
    );
    expect(readThemePreference()).toEqual({
      version: 1,
      themeId: 'glass-light',
      reducedEffects: false,
    });
  }
});
