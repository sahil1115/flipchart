import type { HistoryRequest } from '../../src/providers/types';
import type { Dataset, Listing } from '../../src/data/types';
export const alphaCredential = 'fixture-alpha-not-a-real-key';
export const alphaListing: Listing = {
  id: 'live:alpha-vantage:FIX.LON-UK-GBP',
  symbol: 'FIX.LON',
  name: 'Fixture London',
  region: 'United Kingdom',
  exchange: null,
  mic: null,
  currency: 'GBP',
  timezone: null,
};
export const alphaSearch = {
  bestMatches: [
    {
      '1. symbol': 'FIX.LON',
      '2. name': 'Fixture London',
      '3. type': 'Equity',
      '4. region': 'United Kingdom',
      '7. timezone': 'UTC+01',
      '8. currency': 'GBP',
    },
  ],
};
export function alphaHistory(
  interval: Dataset['metadata']['interval'] = 'daily',
  count = 100,
) {
  const history: Record<string, unknown> = {};
  const date = new Date('2026-10-08T12:00:00Z');
  for (let i = 0; i < count; i++) {
    const time = date.toISOString().slice(0, 10);
    history[time] = {
      '1. open': String(100 + i),
      '2. high': String(102 + i),
      '3. low': String(99 + i),
      '4. close': String(101 + i),
      '5. volume': i === 3 ? null : i === 4 ? '0' : '1000',
    };
    date.setUTCDate(
      date.getUTCDate() -
        (interval === 'daily' ? 1 : interval === 'weekly' ? 7 : 31),
    );
  }
  return {
    'Meta Data': {
      '2. Symbol': 'FIX.LON',
      [interval === 'daily' ? '5. Time Zone' : '4. Time Zone']: 'Europe/London',
    },
    [interval === 'daily'
      ? 'Time Series (Daily)'
      : interval === 'weekly'
        ? 'Weekly Time Series'
        : 'Monthly Time Series']: history,
  };
}
export const alphaRequest: HistoryRequest = {
  listing: alphaListing,
  interval: 'daily',
  adjustment: 'raw',
  from: '2000-01-01',
  to: '2026-10-09',
  accessProfile: { sessionId: 'fixture', plan: null },
};
