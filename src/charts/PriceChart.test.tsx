// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { glassLight } from '../themes/themes';
import { createDemoDataset } from '../demo/dataset';
import { calculate, defaults } from '../indicators/core';
import { definitions, defaultVisibility } from '../indicators/presentation';

const mocks = vi.hoisted(() => {
  const instances: {
    remove: ReturnType<typeof vi.fn>;
    subscribeCrosshairMove: ReturnType<typeof vi.fn>;
    unsubscribeCrosshairMove: ReturnType<typeof vi.fn>;
    applyOptions: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    addSeries: ReturnType<typeof vi.fn>;
    removeSeries: ReturnType<typeof vi.fn>;
    getRange: ReturnType<typeof vi.fn>;
    subscribeWindow: ReturnType<typeof vi.fn>;
    unsubscribeWindow: ReturnType<typeof vi.fn>;
  }[] = [];
  const createChart = vi.fn(() => {
    const range = vi.fn();
    const getRange = vi.fn(() => ({ from: 648, to: 782 }));
    const chart = {
      remove: vi.fn(),
      subscribeCrosshairMove: vi.fn(),
      unsubscribeCrosshairMove: vi.fn(),
      applyOptions: vi.fn(),
      range,
      getRange,
      subscribeWindow: vi.fn(),
      unsubscribeWindow: vi.fn(),
      removeSeries: vi.fn(),
      addSeries: vi.fn(() => ({
        setData: vi.fn(),
        applyOptions: vi.fn(),
        createPriceLine: vi.fn(() => ({ applyOptions: vi.fn() })),
      })),
      panes: () => [
        { setHeight: vi.fn(), setStretchFactor: vi.fn() },
        { setHeight: vi.fn(), setStretchFactor: vi.fn() },
      ],
      timeScale: () => ({
        setVisibleLogicalRange: range,
        getVisibleLogicalRange: getRange,
        subscribeVisibleLogicalRangeChange: chart.subscribeWindow,
        unsubscribeVisibleLogicalRangeChange: chart.unsubscribeWindow,
      }),
    };
    instances.push(chart);
    return chart;
  });
  return { createChart, instances };
});
vi.mock('lightweight-charts', () => ({
  createChart: mocks.createChart,
  CandlestickSeries: {},
  AreaSeries: {},
  LineSeries: {},
  HistogramSeries: {},
  ColorType: { Solid: 'solid' },
}));
import { PriceChart } from './PriceChart';
afterEach(() => {
  cleanup();
  mocks.instances.length = 0;
  vi.clearAllMocks();
});
const candles = createDemoDataset('2026-10-09T00:00:00Z').candles;
describe('chart ownership', () => {
  it('pairs every listener and instance with cleanup through StrictMode and repeated remounts', () => {
    for (let i = 0; i < 3; i++) {
      const view = render(
        <StrictMode>
          <PriceChart
            candles={candles}
            theme={glassLight}
            style="candles"
            range="6M"
            resetRevision={0}
          />
        </StrictMode>,
      );
      view.unmount();
    }
    expect(mocks.instances).toHaveLength(6);
    for (const chart of mocks.instances) {
      expect(chart.remove).toHaveBeenCalledTimes(1);
      expect(chart.subscribeWindow).toHaveBeenCalledTimes(1);
      expect(chart.unsubscribeWindow).toHaveBeenCalledExactlyOnceWith(
        chart.subscribeWindow.mock.calls[0]?.[0],
      );
      expect(chart.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
      expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledExactlyOnceWith(
        chart.subscribeCrosshairMove.mock.calls[0]?.[0],
      );
    }
  });
  it('updates the palette and view without replacing the chart or losing the time range', () => {
    const view = render(
      <PriceChart
        candles={candles}
        theme={glassLight}
        style="candles"
        range="6M"
        resetRevision={0}
      />,
    );
    const chart = mocks.instances[0]!;
    expect(chart.range).toHaveBeenCalledTimes(1);
    view.rerender(
      <PriceChart
        candles={candles}
        theme={{
          ...glassLight,
          chart: { ...glassLight.chart, accent: '#123456' },
        }}
        style="line"
        range="6M"
        resetRevision={0}
      />,
    );
    expect(mocks.createChart).toHaveBeenCalledTimes(1);
    expect(chart.range).toHaveBeenCalledTimes(1);
    expect(chart.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({
          background: { type: 'solid', color: glassLight.chart.background },
        }),
      }),
    );
    view.rerender(
      <PriceChart
        candles={candles}
        theme={glassLight}
        style="area"
        range="1M"
        resetRevision={1}
      />,
    );
    expect(chart.range).toHaveBeenLastCalledWith({ from: 757, to: 782 });
  });
  it('shares one native time scale/crosshair across dynamic panes and preserves zoom on parameter/visibility/theme edits', () => {
    const items = definitions(calculate(candles, defaults), defaults);
    const cursor = vi.fn();
    const view = render(
      <PriceChart
        candles={candles}
        theme={glassLight}
        style="candles"
        range="6M"
        resetRevision={0}
        indicators={items}
        visible={defaultVisibility}
        onCursor={cursor}
      />,
    );
    const chart = mocks.instances[0]!;
    expect(mocks.createChart).toHaveBeenCalledTimes(1);
    expect(chart.addSeries.mock.calls.some((call) => call[2] === 4)).toBe(true);
    expect(chart.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
    const latest = candles.at(-1)!;
    chart.subscribeCrosshairMove.mock.calls[0]![0]({
      time: latest.time,
      point: { x: 1, y: 1 },
    });
    expect(cursor).toHaveBeenLastCalledWith(latest.time);
    chart.range.mockClear();
    view.rerender(
      <PriceChart
        candles={candles}
        theme={{ ...glassLight }}
        style="candles"
        range="6M"
        resetRevision={0}
        indicators={items}
        visible={defaultVisibility}
        onCursor={cursor}
      />,
    );
    expect(chart.range).not.toHaveBeenCalled();
    const changed = definitions(
      calculate(candles, { ...defaults, rsiPeriod: 7 }),
      { ...defaults, rsiPeriod: 7 },
    );
    const seriesCount = chart.addSeries.mock.calls.length;
    view.rerender(
      <PriceChart
        candles={candles}
        theme={glassLight}
        style="candles"
        range="6M"
        resetRevision={0}
        indicators={changed}
        visible={defaultVisibility}
        onCursor={cursor}
      />,
    );
    expect(chart.addSeries).toHaveBeenCalledTimes(seriesCount);
    expect(chart.removeSeries).not.toHaveBeenCalled();
    view.rerender(
      <PriceChart
        candles={candles}
        theme={glassLight}
        style="candles"
        range="6M"
        resetRevision={0}
        indicators={changed}
        visible={{ ...defaultVisibility, obv: true }}
        onCursor={cursor}
      />,
    );
    expect(mocks.createChart).toHaveBeenCalledTimes(1);
    expect(chart.removeSeries).toHaveBeenCalled();
    expect(chart.range).toHaveBeenLastCalledWith({ from: 648, to: 782 });
    expect(chart.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(chart.remove).toHaveBeenCalledTimes(1);
    expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
  });
});
