// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultWorkspacePreference,
  readWorkspacePreference,
  resetPreferences,
  writeWorkspacePreference,
} from './workspace-preference';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('restores validated non-secret preferences and falls back for incompatible/invalid versions', () => {
  writeWorkspacePreference({ version: 1, chartStyle: 'area', range: '1Y' });
  expect(readWorkspacePreference()).toEqual({
    version: 1,
    chartStyle: 'area',
    range: '1Y',
  });
  for (const value of [
    { version: 99, chartStyle: 'area', range: '1Y' },
    { version: 1, chartStyle: 'invalid', range: '1Y' },
  ]) {
    localStorage.setItem('flipchart:workspace', JSON.stringify(value));
    expect(readWorkspacePreference()).toEqual(defaultWorkspacePreference);
  }
});
it('resets only app appearance/view keys, retaining unrelated browser storage', () => {
  localStorage.setItem('unrelated', 'keep');
  localStorage.setItem('flipchart:appearance', '{}');
  writeWorkspacePreference({ version: 1, chartStyle: 'line', range: 'ALL' });
  expect(resetPreferences()).toBe(true);
  expect(localStorage.getItem('unrelated')).toBe('keep');
  expect(localStorage.getItem('flipchart:appearance')).toBeNull();
});
it('denied storage never prevents session use', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readWorkspacePreference()).toEqual(defaultWorkspacePreference);
  expect(writeWorkspacePreference(defaultWorkspacePreference)).toBe(false);
  expect(resetPreferences()).toBe(false);
});
