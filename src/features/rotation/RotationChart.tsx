import { useLayoutEffect, useRef, useState } from 'react';
import { chartSize, plotLayout, quadrantInfo } from '../../rotation/layout';
import type { RotationResult } from '../../rotation/rotation';

/** The rotation chart: quadrants, one tail per sector, the latest week as a dot. */
export function RotationChart({ result }: { result: RotationResult }) {
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
  const height = Math.round(
    Math.max(360, Math.min(chartSize.height, width * 0.64)),
  );
  const plot = plotLayout(
    result,
    width,
    height,
    width < 520 ? { left: 44, right: 16, top: 16, bottom: 48 } : undefined,
  );
  const midX = plot.x(100);
  const midY = plot.y(100);
  const quadrants = [
    ['improving', plot.left, plot.top, midX, midY],
    ['leading', midX, plot.top, plot.right, midY],
    ['lagging', plot.left, midY, midX, plot.bottom],
    ['weakening', midX, midY, plot.right, plot.bottom],
  ] as const;
  const corners = [
    ['improving', plot.left + 10, plot.top + 16, 'start'],
    ['leading', plot.right - 10, plot.top + 16, 'end'],
    ['lagging', plot.left + 10, plot.bottom - 10, 'start'],
    ['weakening', plot.right - 10, plot.bottom - 10, 'end'],
  ] as const;
  return (
    <div className="rotation-chart-host" ref={host}>
      <svg
        className="rotation-chart"
        data-testid="rotation-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${result.universe}: ${result.sectors
          .map(
            (sector) => `${sector.label} ${quadrantInfo[sector.quadrant].name}`,
          )
          .join(', ')}. The table below lists the values.`}
      >
        {quadrants.map(([id, x0, y0, x1, y1]) => (
          <rect
            key={id}
            x={x0}
            y={y0}
            width={x1 - x0}
            height={y1 - y0}
            fill={quadrantInfo[id].color}
            fillOpacity={0.1}
          />
        ))}
        {plot.xTicks.map((tick) => (
          <g key={`x${tick}`}>
            <line
              className="rotation-grid"
              x1={plot.x(tick)}
              x2={plot.x(tick)}
              y1={plot.top}
              y2={plot.bottom}
            />
            <text
              className="rotation-tick"
              x={plot.x(tick)}
              y={plot.bottom + 16}
              textAnchor="middle"
            >
              {tick}
            </text>
          </g>
        ))}
        {plot.yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line
              className="rotation-grid"
              x1={plot.left}
              x2={plot.right}
              y1={plot.y(tick)}
              y2={plot.y(tick)}
            />
            <text
              className="rotation-tick"
              x={plot.left - 8}
              y={plot.y(tick) + 4}
              textAnchor="end"
            >
              {tick}
            </text>
          </g>
        ))}
        <line
          className="rotation-axis"
          x1={midX}
          x2={midX}
          y1={plot.top}
          y2={plot.bottom}
        />
        <line
          className="rotation-axis"
          x1={plot.left}
          x2={plot.right}
          y1={midY}
          y2={midY}
        />
        <text
          className="rotation-axis-title"
          x={(plot.left + plot.right) / 2}
          y={plot.bottom + 40}
          textAnchor="middle"
        >
          RS-Ratio: trend against the benchmark →
        </text>
        <text
          className="rotation-axis-title"
          transform={`translate(16 ${(plot.top + plot.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          RS-Momentum: is it improving? →
        </text>
        {corners.map(([id, x, y, anchor]) => (
          <text
            key={id}
            className="rotation-corner"
            x={x}
            y={y}
            textAnchor={anchor}
            fill={quadrantInfo[id].color}
          >
            {quadrantInfo[id].name.toUpperCase()}
          </text>
        ))}
        {plot.sectors.map((sector) => {
          const color = quadrantInfo[sector.quadrant].color;
          return (
            <g key={sector.label}>
              <polyline
                points={sector.path.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={color}
                strokeOpacity={0.6}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {sector.path.slice(0, -1).map((p, index) => (
                <circle
                  key={index}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={color}
                  fillOpacity={0.6}
                />
              ))}
              <circle
                className="rotation-dot"
                cx={sector.end.x}
                cy={sector.end.y}
                r={6}
                fill={color}
              />
              <text
                className="rotation-label"
                x={sector.text.x}
                y={sector.text.y}
                textAnchor={sector.text.anchor}
              >
                {sector.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
