import type { Candle, Listing } from '../../src/data/types';
import type { HistoryRequest } from '../../src/providers/types';
export const fixtureCredential = 'fixture-only-not-a-real-key';
export const listing: Listing = {
  id: 'live:twelve-data:fixture-XNAS',
  symbol: 'FIX',
  name: 'Fictional Hardware Co.',
  exchange: 'NASDAQ',
  mic: 'XNAS',
  currency: 'USD',
  timezone: 'America/New_York',
};
export const secondListing: Listing = {
  ...listing,
  id: 'live:twelve-data:fixture-XLON',
  exchange: 'LSE',
  mic: 'XLON',
  currency: 'GBP',
  timezone: 'Europe/London',
};
export const request: HistoryRequest = {
  listing,
  interval: 'daily',
  adjustment: 'raw',
  from: '2024-01-01',
  to: '2026-10-09',
  accessProfile: { sessionId: 'fixture-access', plan: null },
};
export const searchResponse = {
  status: 'ok',
  data: [listing, secondListing].map((item) => ({
    symbol: item.symbol,
    instrument_name: item.name,
    exchange: item.exchange,
    mic_code: item.mic,
    currency: item.currency,
    exchange_timezone: item.timezone,
    instrument_type: 'Common Stock',
  })),
};
export const usageResponse = {
  current_usage: 2,
  plan_limit: 8,
  plan_category: 'fixture-basic',
  timestamp: '2026-10-09 12:00:00',
};
export function historyResponse(
  selected: Listing = listing,
  count = 240,
  latest = '2026-10-08',
) {
  const end = new Date(`${latest}T12:00:00Z`);
  const candles: Candle[] = Array.from({ length: count }, (_, i) => {
    const time = new Date(end.getTime() - (count - i - 1) * 86400000)
      .toISOString()
      .slice(0, 10) as Candle['time'];
    return {
      time,
      open: 100 + i * 0.1,
      high: 102 + i * 0.1,
      low: 99 + i * 0.1,
      close: 101 + i * 0.1,
      volume: i === 3 ? null : i === 4 ? 0 : 1000 + i,
    };
  });
  return {
    status: 'ok',
    meta: {
      symbol: selected.symbol,
      exchange: selected.exchange,
      mic_code: selected.mic,
      currency: selected.currency,
      exchange_timezone: selected.timezone,
      interval: '1day',
    },
    values: candles.reverse().map((bar) => ({
      datetime: bar.time,
      open: String(bar.open),
      high: String(bar.high),
      low: String(bar.low),
      close: String(bar.close),
      ...(bar.volume === null ? {} : { volume: String(bar.volume) }),
    })),
  };
}
