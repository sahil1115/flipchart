import { normalizeCandles } from '../data/normalize';
import type { Candle, Dataset, TradingDate } from '../data/types';

const round = (value: number) => Math.round(value * 100) / 100;

/** Fixed seed and UTC weekday cadence, not an actual exchange calendar or security. */
export function createDemoDataset(retrievedAt: string): Dataset {
  const rows: Candle[] = [];
  let seed = 41023;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const date = new Date('2023-01-02T00:00:00.000Z');
  let previousClose = 112;
  while (rows.length < 780) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      const i = rows.length;
      const open = round(previousClose + (random() - 0.5) * 1.4);
      const close = round(
        open + 0.07 + Math.sin(i / 21) * 0.28 + (random() - 0.49) * 2.7,
      );
      rows.push({
        time: date.toISOString().slice(0, 10) as TradingDate,
        open,
        close,
        high: round(Math.max(open, close) + 0.2 + random() * 1.8),
        low: round(Math.min(open, close) - 0.2 - random() * 1.8),
        volume: Math.round(650000 + random() * 1600000),
        incomplete: false,
      });
      previousClose = close;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const candles = normalizeCandles(rows);
  const from = candles[0]!.time;
  const to = candles.at(-1)!.time;
  return {
    candles,
    metadata: {
      id: 'demo:FLIP:daily',
      revision: 'synthetic-v1-seed-41023',
      mode: 'demo',
      source: 'Bundled synthetic OHLCV · fixed seed 41023',
      provider: null,
      listing: {
        id: 'demo:FLIP',
        symbol: 'FLIP',
        name: 'FlipChart Demo',
        exchange: 'Synthetic · no exchange',
        mic: null,
        currency: 'USD',
        timezone: 'UTC',
      },
      interval: 'daily',
      adjustment: 'synthetic',
      requestedRange: { from, to },
      coverage: { from, to },
      retrievedAt,
      latestCandleTime: to,
      freshness: 'historical-demo',
      delay: 'synthetic',
      aggregation: null,
    },
  };
}
