// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultTypography,
  readTypographyPreference,
  typographyKey,
  writeTypographyPreference,
} from './typography-preference';
import { resetPreferences } from './workspace-preference';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('restores text settings, discards unknown fields, and resets alongside appearance', () => {
  expect(
    writeTypographyPreference({ version: 1, font: 'verdana', size: 130 }),
  ).toBe(true);
  expect(readTypographyPreference()).toEqual({
    version: 1,
    font: 'verdana',
    size: 130,
  });
  localStorage.setItem('unrelated', 'keep');
  expect(resetPreferences()).toBe(true);
  expect(readTypographyPreference()).toEqual(defaultTypography);
  expect(localStorage.getItem('unrelated')).toBe('keep');
});
it('falls back safely for corrupt or unsupported text settings and unavailable storage', () => {
  for (const value of [
    { version: 2, font: 'arial', size: 100 },
    { version: 1, font: 'unknown', size: 100 },
    { version: 1, font: 'arial', size: 500 },
    { version: 1, font: 'arial', size: 105 },
    { version: 1, font: 'arial', size: '100' },
  ]) {
    localStorage.setItem(typographyKey, JSON.stringify(value));
    expect(readTypographyPreference()).toEqual(defaultTypography);
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readTypographyPreference()).toEqual(defaultTypography);
  expect(writeTypographyPreference(defaultTypography)).toBe(false);
});
