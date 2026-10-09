import type { Dataset } from '../data/types';
export function dailySummary(dataset: Dataset) {
  const bars =
    dataset.metadata.interval === 'daily'
      ? dataset.candles.filter((bar) => !bar.incomplete)
      : [];
  const latest = bars.at(-1);
  if (!latest)
    return { time: null, high52: null, low52: null, distance200: null };
  const first = new Date(`${latest.time}T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 364);
  const boundary = first.toISOString().slice(0, 10);
  const window = bars.filter((bar) => bar.time >= boundary);
  const covered = bars[0]!.time <= boundary && window.length >= 252;
  const recent = bars.slice(-200);
  const average = recent.reduce((sum, bar) => sum + bar.close / 200, 0);
  const distance =
    recent.length === 200 && average !== 0
      ? 100 * (latest.close / average - 1)
      : null;
  return {
    time: latest.time,
    high52: covered ? Math.max(...window.map((bar) => bar.high)) : null,
    low52: covered ? Math.min(...window.map((bar) => bar.low)) : null,
    distance200:
      distance !== null && Number.isFinite(distance) ? distance : null,
  };
}
