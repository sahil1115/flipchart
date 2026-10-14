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

/**
 * No exchange calendar inference. Any missing weekday sets the informational
 * `partial` flag (it may be an exchange holiday). A bar is only `incomplete`
 * (excluded from indicators) when a constituent is provisional or the period is
 * unfilled at the start or end of the source history; interior gaps are not.
 */
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
  const candles = [...groups].map(([time, rows], index, all): Candle => {
    const { first, last } = bounds(time, interval);
    const present = new Set(rows.map((row) => row.time));
    const firstRow = rows[0]!;
    const lastRow = rows.at(-1)!;
    const provisional = rows.some((row) => row.incomplete);
    let partial = provisional;
    let leadingGap = false;
    let trailingGap = false;
    for (
      const cursor = new Date(first);
      cursor <= last;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const day = dateString(cursor);
      if (![0, 6].includes(cursor.getUTCDay()) && !present.has(day)) {
        partial = true;
        if (day < firstRow.time) leadingGap = true;
        if (day > lastRow.time) trailingGap = true;
      }
    }
    const incomplete =
      provisional ||
      (index === 0 && leadingGap) ||
      (index === all.length - 1 && trailingGap);
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
      incomplete,
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
      aggregation: `Local ${interval}: first open, maximum high, minimum low, last close; volume null if any constituent is unknown. Missing weekdays are noted as unverified (possible holidays); only provisional bars and unfilled periods at the start or end of the history are marked incomplete.`,
      aggregationDetails: {
        sourceInterval: 'daily',
        sourceCoverage: dataset.metadata.coverage,
        calendar: 'UTC weekdays; exchange holidays unverified',
        groups: details,
      },
    },
  });
}
