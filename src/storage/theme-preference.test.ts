// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readThemePreference, writeThemePreference } from './theme-preference';
import { resolveTheme } from '../themes/themes';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
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
