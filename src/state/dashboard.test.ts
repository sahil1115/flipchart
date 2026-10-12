// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultDashboard,
  readDashboard,
  writeDashboard,
  validateDashboard,
} from './dashboard';
import {
  readCredential,
  writeCredential,
} from '../storage/provider-credential';
import { alphaListing } from '../../tests/fixtures/alpha-vantage';
import {
  readWatchlist,
  writeWatchlist,
  validateWatchlist,
} from '../storage/watchlist';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('migrates visibility-only preferences; projects only validated layout and parameters', () => {
  const base = defaultDashboard();
  expect(
    validateDashboard({
      version: 1,
      visible: base.visible,
      credential: 'never',
    }),
  ).toEqual(base);
  const value = {
    ...base,
    parameters: { ...base.parameters, rsiPeriod: 7 },
    expanded: 'all' as const,
    credential: 'never',
  };
  expect(writeDashboard(value)).toBe(true);
  expect(readDashboard().parameters.rsiPeriod).toBe(7);
  expect(localStorage.getItem('flipchart:dashboard')).not.toContain('never');
  for (const patch of [
    { version: 99 },
    { expanded: 'unknown' },
    { parameters: { ...base.parameters, rsiPeriod: 0 } },
    { visible: { ...base.visible, rsi: 'true' } },
    { chartVisible: { ...base.chartVisible, sma: 'true' } },
  ])
    expect(() => validateDashboard({ ...base, ...patch })).toThrow();
});
it('migrates linked chart preferences once and persists independent readout/chart choices', () => {
  const base = defaultDashboard();
  const legacy = validateDashboard({
    ...base,
    version: 2,
    visible: { ...base.visible, ema: true },
  });
  expect(legacy.chartVisible.ema).toBe(true);
  expect(legacy.chartVisible).not.toBe(legacy.visible);
  expect(
    writeDashboard({
      ...legacy,
      visible: { ...legacy.visible, sma: false },
      chartVisible: { ...legacy.chartVisible, ema: false },
    }),
  ).toBe(true);
  const restored = readDashboard();
  expect(restored.visible.sma).toBe(false);
  expect(restored.chartVisible.sma).toBe(true);
  expect(restored.visible.ema).toBe(true);
  expect(restored.chartVisible.ema).toBe(false);
});
it('keeps provider credentials isolated from each other, watchlist and preference reset scopes', () => {
  writeCredential('fixture-only-twelve', true);
  writeCredential('fixture-only-alpha', true, 'alpha-vantage');
  expect(readCredential().credential).toBe('fixture-only-twelve');
  expect(readCredential('alpha-vantage').credential).toBe('fixture-only-alpha');
  expect(
    writeWatchlist([
      {
        provider: 'alpha-vantage',
        listing: {
          ...alphaListing,
          credential: 'discard',
        } as typeof alphaListing,
      },
    ]),
  ).toBe(true);
  expect(readWatchlist()).toEqual([
    { provider: 'alpha-vantage', listing: alphaListing },
  ]);
  expect(localStorage.getItem('flipchart:watchlist')).not.toContain('discard');
  expect(() =>
    validateWatchlist({
      version: 1,
      entries: [{ provider: 'twelve-data', listing: alphaListing }],
    }),
  ).toThrow();
  writeCredential('', false, 'alpha-vantage');
  expect(readCredential('alpha-vantage').credential).toBe('');
  expect(readCredential().credential).toBe('fixture-only-twelve');
});
it('falls back for corrupt preferences and denied storage without blocking session updates', () => {
  localStorage.setItem('flipchart:dashboard', 'invalid');
  expect(readDashboard()).toEqual(defaultDashboard());
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(writeDashboard(defaultDashboard())).toBe(false);
  expect(writeWatchlist([])).toBe(false);
});
