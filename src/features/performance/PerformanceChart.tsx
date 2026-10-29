import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import {
  chartSize,
  formatDate,
  performanceLayout,
} from '../../performance/layout';
import { formatChange } from '../../performance/performance';
import type { PerformanceResult } from '../../performance/performance';

/** Lines rebased to the period start, with a crosshair that reads every value at a date. */
export function PerformanceChart({
  result,
  dark,
  highlight,
}: {
  result: PerformanceResult;
  dark: boolean;
  highlight: string | null;
}) {
  // Draw at the available width so text stays readable on phones.
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(chartSize.width);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const update = () =>
      setWidth(
        Math.round(Math.min(chartSize.width, Math.max(300, node.clientWidth))),
      );
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const small = width < 520;
  const height = small ? 360 : chartSize.height;
  const plot = performanceLayout(
    result,
    width,
    height,
    dark ? 'dark' : 'light',
    small ? { left: 44, right: 64, top: 16, bottom: 32 } : undefined,
    !small,
  );
  const last = result.dates.length - 1;
  const [hover, setHover] = useState<number | null>(null);
  const index = hover === null ? null : Math.min(hover, last);
  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(last, Math.round(ratio * last))));
  };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      Home: -last,
      End: last,
    };
    if (!(event.key in moves)) {
      if (event.key === 'Escape') setHover(null);
      return;
    }
    event.preventDefault();
    setHover((current) =>
      Math.max(0, Math.min(last, (current ?? last) + moves[event.key]!)),
    );
  };
  const values =
    index === null
      ? []
      : plot.lines
          .map((line, n) => ({
            ...line,
            value: (n < result.stocks.length
              ? result.stocks[n]!
              : result.benchmark!
            ).changes[index]!,
          }))
          .sort((a, b) => b.value - a.value);
  const zero = plot.y(0);
  return (
    <div
      className="performance-chart-host"
      ref={host}
      tabIndex={0}
      aria-label="Performance chart. Use the left and right arrow keys to read values by date."
      onKeyDown={step}
      onBlur={() => setHover(null)}
    >
      <svg
        className="performance-chart"
        data-testid="performance-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Percent change from ${result.dates[0]} to ${result.dates[last]}: ${[
          ...result.stocks,
          ...(result.benchmark ? [result.benchmark] : []),
        ]
          .map((line) => `${line.symbol} ${formatChange(line.total)}`)
          .join(', ')}. The table below lists the values.`}
      >
        {plot.yTicks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'performance-zero' : 'performance-grid'}
              x1={plot.left}
              x2={plot.right}
              y1={plot.y(tick)}
              y2={plot.y(tick)}
            />
            <text
              className="performance-tick"
              x={plot.left - 8}
              y={plot.y(tick) + 4}
              textAnchor="end"
            >
              {formatChange(tick, Number.isInteger(tick) ? 0 : 1)}
            </text>
          </g>
        ))}
        {plot.xTicks.map((tick, n) => (
          <text
            key={tick.index}
            className="performance-tick"
            x={plot.x(tick.index)}
            y={plot.bottom + 20}
            textAnchor={
              n === 0
                ? 'start'
                : n === plot.xTicks.length - 1
                  ? 'end'
                  : 'middle'
            }
          >
            {tick.label}
          </text>
        ))}
        <line
          className="performance-zero"
          x1={plot.left}
          x2={plot.right}
          y1={zero}
          y2={zero}
        />
        {plot.lines.map((line) => (
          <g
            key={line.symbol}
            className="performance-line"
            opacity={highlight && highlight !== line.symbol ? 0.2 : 1}
          >
            <polyline
              points={line.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth={highlight === line.symbol ? 3 : 2}
              strokeDasharray={line.benchmark ? '6 4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {line.label.y !== line.end.y && (
              <line
                x1={line.end.x}
                y1={line.end.y}
                x2={plot.right + 6}
                y2={line.label.y}
                stroke={line.color}
                strokeWidth={1}
              />
            )}
            <circle
              cx={plot.right + 10}
              cy={line.label.y}
              r={4}
              fill={line.color}
            />
            <text
              className="performance-label"
              x={plot.right + 18}
              y={line.label.y + 4}
            >
              {line.label.text}
            </text>
          </g>
        ))}
        {index !== null && (
          <g className="performance-crosshair" pointerEvents="none">
            <line
              x1={plot.x(index)}
              x2={plot.x(index)}
              y1={plot.top}
              y2={plot.bottom}
            />
            {values.map((line) => (
              <circle
                key={line.symbol}
                cx={plot.x(index)}
                cy={plot.y(line.value)}
                r={4}
                fill={line.color}
              />
            ))}
          </g>
        )}
        <rect
          className="performance-hit"
          x={plot.left}
          y={plot.top}
          width={plot.right - plot.left}
          height={plot.bottom - plot.top}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {index !== null && (
        <div
          className="performance-tooltip"
          role="status"
          style={
            plot.x(index) > width / 2
              ? { right: width - plot.x(index) + 12 }
              : { left: plot.x(index) + 12 }
          }
        >
          <strong>{formatDate(result.dates[index]!, false)}</strong>
          {values.map((line) => (
            <span key={line.symbol}>
              <i style={{ background: line.color }} aria-hidden="true" />
              {line.symbol}
              <b>{formatChange(line.value)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
