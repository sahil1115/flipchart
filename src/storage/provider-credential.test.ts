// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readCredential, writeCredential } from './provider-credential';
import { fixtureCredential } from '../../tests/fixtures/twelve-data';
import { resetPreferences } from './workspace-preference';
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
it('defaults to memory and saves only explicitly remembered credentials in a separate versioned key', () => {
  expect(readCredential()).toMatchObject({ credential: '', remembered: false });
  writeCredential(fixtureCredential, false);
  expect(localStorage.length).toBe(0);
  writeCredential(fixtureCredential, true);
  expect(readCredential()).toMatchObject({
    credential: fixtureCredential,
    remembered: true,
  });
  expect(localStorage.getItem('flipchart:workspace')).toBeNull();
  expect(localStorage.getItem('flipchart:appearance')).toBeNull();
  resetPreferences();
  expect(readCredential().credential).toBe(fixtureCredential);
  writeCredential('', false);
  expect(readCredential().credential).toBe('');
});
it('handles unsupported/invalid schemas and storage denial without requiring durable keys', () => {
  localStorage.setItem(
    'flipchart:credential:twelve-data',
    JSON.stringify({ version: 99, credential: fixtureCredential }),
  );
  expect(readCredential().credential).toBe('');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readCredential().warning).toMatch(/unavailable/);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(writeCredential(fixtureCredential, true)).toBe(false);
});
