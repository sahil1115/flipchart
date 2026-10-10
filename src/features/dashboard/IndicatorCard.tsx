import type { Candle, TradingDate } from '../../data/types';
import type { Dataset } from '../../data/types';
import type { IndicatorDefinition } from '../../indicators/presentation';
import { latestValue } from '../../indicators/core';
import { formatValue, valueUnit } from './readout';
export function IndicatorCard({
  item,
  candles,
  cursor,
  currency,
  interval = 'daily',
  collapsed = false,
  expanded = false,
  onCollapse,
  onExpand,
  onToggle,
}: {
  item: IndicatorDefinition;
  candles: Candle[];
  cursor: TradingDate | null;
  currency: string | null;
  interval?: Dataset['metadata']['interval'];
  collapsed?: boolean;
  expanded?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
  onToggle?: (checked: boolean) => void;
}) {
  const cursorIndex = cursor
    ? candles.findIndex((bar) => bar.time === cursor)
    : -1;
  const finalized = candles.filter((bar) => !bar.incomplete).length;
  return (
    <article
      className={`indicator-card${expanded ? ' expanded' : ''}`}
      aria-label={item.name}
    >
      <h3>
        {onToggle ? (
          <label>
            <input
              type="checkbox"
              checked
              onChange={(event) => onToggle(event.target.checked)}
            />
            {item.name}
          </label>
        ) : (
          item.name
        )}
      </h3>
      <div className="panel-actions">
        <button
          aria-label={`${collapsed ? 'Show' : 'Collapse'} ${item.name} details`}
          aria-expanded={!collapsed}
          onClick={onCollapse}
        >
          {collapsed ? '⌄' : '⌃'}
        </button>
        <button
          aria-label={`${expanded ? 'Restore' : 'Expand'} ${item.name} panel`}
          aria-pressed={expanded}
          onClick={onExpand}
        >
          {expanded ? '−' : '+'}
        </button>
      </div>
      <div hidden={collapsed}>
        <p className="small">
          {item.units === 'price'
            ? (currency ?? 'Price units')
            : item.units === 'volume'
              ? 'Volume units as supplied'
              : item.units === 'percent'
                ? 'Percent'
                : item.units === 'unbounded'
                  ? 'Unbounded index'
                  : item.units === 'negative-index'
                    ? 'Index · −100–0'
                    : 'Index · 0–100'}{' '}
          · {interval} periods
        </p>
        <dl>
          {item.series.map((series) => {
            const value = cursor
              ? cursorIndex < 0 || series.values[cursorIndex] === null
                ? null
                : { time: cursor, value: series.values[cursorIndex]! }
              : latestValue(candles, series.values);
            const latest = candles.at(-1)?.time;
            const required = series.required ?? item.required;
            const available =
              cursorIndex >= 0
                ? candles
                    .slice(0, cursorIndex + 1)
                    .filter((bar) => !bar.incomplete).length
                : finalized;
            const reason =
              cursorIndex >= 0 && candles[cursorIndex]?.incomplete
                ? 'Incomplete candle excluded from finalized calculations.'
                : available < required
                  ? `Needs ${required} finalized bars; ${available} available.`
                  : item.units === 'volume'
                    ? 'Unknown volume prevents a value at this date.'
                    : 'Warm-up, incomplete bar or numeric range unavailable.';
            return (
              <div key={series.name}>
                <dt>{series.name}</dt>
                <dd>
                  <strong
                    title={
                      value
                        ? value.value.toLocaleString('en-US', {
                            maximumFractionDigits:
                              item.units === 'volume' ? 0 : 8,
                          })
                        : reason
                    }
                  >
                    {value
                      ? formatValue(value.value, item.units)
                      : 'Unavailable'}
                  </strong>
                  {value && (
                    <span className="readout-unit">
                      {valueUnit(item.units, currency)}
                    </span>
                  )}
                  <span className="small">
                    {value
                      ? `${cursor ? 'Cursor' : 'Latest valid'} · ${value.time}${!cursor && value.time !== latest ? ' · earlier than latest candle' : ''}`
                      : reason}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
        <details>
          <summary>Calculation</summary>
          <p className="small">{item.formula}</p>
        </details>
      </div>
    </article>
  );
}
