import type { Candle, Dataset, TradingDate } from './types';
import { validateDataset } from './validate';

const dateString = (date: Date) =>
  date.toISOString().slice(0, 10) as TradingDate;
function bounds(time: TradingDate, interval: 'weekly' | 'monthly') {
  const first = new Date(`${time}T00:00:00Z`);
  const last = new Date(first);
  if (interval === 'weekly') {
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
    last.setTime(first.getTime());
    last.setUTCDate(last.getUTCDate() + 6);
  } else {
    first.setUTCDate(1);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
  }
  return { first, last };
}

/** No exchange calendar inference: missing weekdays conservatively flag partial coverage. */
export function aggregateDaily(
  input: Dataset,
  interval: 'weekly' | 'monthly',
): Dataset {
  const dataset = validateDataset(input);
  if (dataset.metadata.interval !== 'daily')
    throw new Error('Local aggregation requires daily input.');
  const groups = new Map<TradingDate, Candle[]>();
  for (const candle of dataset.candles) {
    const key = dateString(bounds(candle.time, interval).first);
    const group = groups.get(key) ?? [];
    group.push(candle);
    groups.set(key, group);
  }
  const details: NonNullable<
    Dataset['metadata']['aggregationDetails']
  >['groups'] = [];
  const candles = [...groups].map(([time, rows]): Candle => {
    const { first, last } = bounds(time, interval);
    const present = new Set(rows.map((row) => row.time));
    let partial = rows.some((row) => row.incomplete);
    for (
      const cursor = new Date(first);
      cursor <= last;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      if (
        ![0, 6].includes(cursor.getUTCDay()) &&
        !present.has(dateString(cursor))
      )
        partial = true;
    }
    const firstRow = rows[0]!;
    const lastRow = rows.at(-1)!;
    details.push({
      time,
      from: firstRow.time,
      to: lastRow.time,
      count: rows.length,
      partial,
    });
    return {
      time,
      open: firstRow.open,
      high: Math.max(...rows.map((row) => row.high)),
      low: Math.min(...rows.map((row) => row.low)),
      close: lastRow.close,
      volume: rows.some((row) => row.volume === null)
        ? null
        : rows.reduce((sum, row) => sum + row.volume!, 0),
      incomplete: partial,
    };
  });
  return validateDataset({
    candles,
    metadata: {
      ...dataset.metadata,
      id: `${dataset.metadata.id}:local-${interval}`,
      revision: `${dataset.metadata.revision}:aggregate-v1-${interval}`,
      interval,
      coverage: candles.length
        ? { from: candles[0]!.time, to: candles.at(-1)!.time }
        : null,
      latestCandleTime: candles.at(-1)?.time ?? null,
      aggregation: `Local ${interval}: first open, maximum high, minimum low, last close; volume null if any constituent is unknown. Missing weekdays mark partial coverage.`,
      aggregationDetails: {
        sourceInterval: 'daily',
        sourceCoverage: dataset.metadata.coverage,
        calendar: 'UTC weekdays; exchange holidays unverified',
        groups: details,
      },
    },
  });
}
