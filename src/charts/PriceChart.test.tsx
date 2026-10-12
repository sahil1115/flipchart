// @vitest-environment jsdom
import { StrictMode } from 'react';
import {
  act,
  cleanup,
  render,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { glassLight } from '../themes/themes';
import { createDemoDataset } from '../demo/dataset';
import { calculate, defaults } from '../indicators/core';
import { definitions, defaultVisibility } from '../indicators/presentation';
import { TypographyContext } from '../themes/TypographyContext';
import { defaultTypography } from '../storage/typography-preference';

const mocks = vi.hoisted(() => {
  const instances: {
    remove: ReturnType<typeof vi.fn>;
    subscribeCrosshairMove: ReturnType<typeof vi.fn>;
    unsubscribeCrosshairMove: ReturnType<typeof vi.fn>;
    subscribeClick: ReturnType<typeof vi.fn>;
    unsubscribeClick: ReturnType<typeof vi.fn>;
    applyOptions: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    addSeries: ReturnType<typeof vi.fn>;
    removeSeries: ReturnType<typeof vi.fn>;
    getRange: ReturnType<typeof vi.fn>;
    subscribeWindow: ReturnType<typeof vi.fn>;
    unsubscribeWindow: ReturnType<typeof vi.fn>;
    subscribeSize: ReturnType<typeof vi.fn>;
    unsubscribeSize: ReturnType<typeof vi.fn>;
    axis: {
      width: ReturnType<typeof vi.fn>;
      options: ReturnType<typeof vi.fn>;
      applyOptions: ReturnType<typeof vi.fn>;
    };
  }[] = [];
  const createChart = vi.fn(() => {
    const range = vi.fn();
    const getRange = vi.fn(() => ({ from: 648, to: 782 }));
    const chart = {
      remove: vi.fn(),
      subscribeCrosshairMove: vi.fn(),
      unsubscribeCrosshairMove: vi.fn(),
      subscribeClick: vi.fn(),
      unsubscribeClick: vi.fn(),
      setCrosshairPosition: vi.fn(),
      clearCrosshairPosition: vi.fn(),
      applyOptions: vi.fn(),
      range,
      getRange,
      subscribeWindow: vi.fn(),
      unsubscribeWindow: vi.fn(),
      subscribeSize: vi.fn(),
      unsubscribeSize: vi.fn(),
      axis: {
        width: vi.fn(() => 64),
        options: vi.fn(() => ({ minimumWidth: 64 })),
        applyOptions: vi.fn(),
      },
      priceScale: () => chart.axis,
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
        subscribeSizeChange: chart.subscribeSize,
        unsubscribeSizeChange: chart.unsubscribeSize,
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
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  createSeriesMarkers: () => ({ setMarkers: vi.fn() }),
}));
import { PriceChart } from './PriceChart';
import { SplitChart } from './SplitChart';
afterEach(() => {
  cleanup();
  mocks.instances.length = 0;
  vi.clearAllMocks();
});
const candles = createDemoDataset('2026-10-09T00:00:00Z').candles;
describe('chart ownership', () => {
  it('overlays momentum in the price pane on its own scale, independently of readout visibility', () => {
    const items = definitions(calculate(candles, defaults), defaults);
    const props = {
      candles,
      theme: glassLight,
      style: 'candles' as const,
      range: '6M' as const,
      resetRevision: 0,
      indicators: items,
      visible: { ...defaultVisibility, rsi: false },
      priceOnly: true,
      activePane: 'obv' as const,
    };
    const view = render(<PriceChart {...props} momentumOverlay="rsi" />);
    const chart = mocks.instances[0]!;
    const overlay = chart.addSeries.mock.calls.find(
      (call) => call[1]?.priceScaleId === 'momentum-overlay',
    );
    expect(overlay).toBeDefined();
    expect(overlay![2]).toBe(0);
    expect(overlay![1].autoscaleInfoProvider()).toEqual({
      priceRange: { minValue: 0, maxValue: 100 },
    });
    expect(view.getByTestId('momentum-overlay-legend').textContent).toContain(
      'independent scale',
    );
    fireEvent.click(view.getByRole('button', { name: 'Inspect previous bar' }));
    const date = candles.at(-2)!.time;
    expect(
      view.container.querySelector('.chart-legend')!.textContent,
    ).toContain(date);
    view.rerender(<PriceChart {...props} momentumOverlay={null} />);
    expect(chart.removeSeries).toHaveBeenCalled();
    expect(view.queryByTestId('momentum-overlay-legend')).toBeNull();
    expect(
      view.container.querySelector('.chart-legend')!.textContent,
    ).toContain(date);
    expect(mocks.createChart).toHaveBeenCalledTimes(1);
    expect(chart.range).toHaveBeenLastCalledWith({ from: 648, to: 782 });
  });
  it('changes chart-label typography without replacing the chart or clearing a pinned inspection', () => {
    const view = render(
      <TypographyContext value={defaultTypography}>
        <PriceChart
          candles={candles}
          theme={glassLight}
          style="candles"
          range="6M"
          resetRevision={0}
        />
      </TypographyContext>,
    );
    const chart = mocks.instances[0]!;
    fireEvent.click(view.getByRole('button', { name: 'Inspect previous bar' }));
    const pinned = view.container.querySelector('.chart-legend')!.textContent;
    const rangeCalls = chart.range.mock.calls.length;
    view.rerender(
      <TypographyContext value={{ version: 1, font: 'verdana', size: 140 }}>
        <PriceChart
          candles={candles}
          theme={glassLight}
          style="candles"
          range="6M"
          resetRevision={0}
        />
      </TypographyContext>,
    );
    expect(mocks.createChart).toHaveBeenCalledTimes(1);
    expect(chart.range).toHaveBeenCalledTimes(rangeCalls + 1);
    expect(chart.range).toHaveBeenLastCalledWith({ from: 648, to: 782 });
    expect(chart.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({
          fontFamily: 'Verdana, Geneva, sans-serif',
          fontSize: 15,
        }),
      }),
    );
    expect(view.container.querySelector('.chart-legend')!.textContent).toBe(
      pinned,
    );
  });
  it('synchronizes split plot ranges, axis widths and inspection, and cleans up every chart', async () => {
    const onCursor = vi.fn();
    const items = definitions(calculate(candles, defaults), defaults);
    const view = render(
      <SplitChart
        candles={candles}
        theme={glassLight}
        style="candles"
        range="6M"
        resetRevision={0}
        indicators={items}
        visible={defaultVisibility}
        activePane="rsi"
        controls={<div>Categories</div>}
        onCursor={onCursor}
      />,
    );
    expect(mocks.instances).toHaveLength(3);
    const window = { from: 500, to: 600 };
    act(() => mocks.instances[1]!.subscribeWindow.mock.calls[0]![0](window));
    expect(mocks.instances[0]!.range).toHaveBeenLastCalledWith(window);
    expect(mocks.instances[2]!.range).toHaveBeenLastCalledWith(window);
    // A wider volume label must not move its dates relative to the price plot.
    mocks.instances[1]!.axis.width.mockReturnValue(70);
    act(() => mocks.instances[1]!.subscribeSize.mock.calls[0]![0](1000, 86));
    await waitFor(() => {
      for (const chart of mocks.instances) {
        expect(chart.axis.applyOptions).toHaveBeenLastCalledWith({
          minimumWidth: 70,
        });
        expect(chart.range).toHaveBeenLastCalledWith(window);
      }
    });
    for (const chart of mocks.instances) {
      chart.axis.options.mockReturnValue({ minimumWidth: 70 });
      chart.getRange.mockReturnValue(window);
    }
    view.rerender(
      <SplitChart
        candles={candles}
        theme={glassLight}
        style="candles"
        range="6M"
        resetRevision={0}
        indicators={items.map((item) => ({ ...item }))}
        visible={defaultVisibility}
        activePane="rsi"
        controls={<div>Categories</div>}
        onCursor={onCursor}
      />,
    );
    expect(mocks.instances).toHaveLength(3);
    for (const chart of mocks.instances) {
      expect(chart.applyOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          rightPriceScale: expect.objectContaining({ minimumWidth: 70 }),
        }),
      );
    }
    const time = candles.at(-2)!.time;
    act(() =>
      mocks.instances[2]!.subscribeClick.mock.calls[0]![0]({
        time,
        point: { x: 100, y: 50 },
      }),
    );
    expect(onCursor).toHaveBeenLastCalledWith(time);
    view.unmount();
    for (const chart of mocks.instances) {
      expect(chart.remove).toHaveBeenCalledTimes(1);
      expect(chart.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
      expect(chart.unsubscribeClick).toHaveBeenCalledTimes(1);
      expect(chart.unsubscribeWindow).toHaveBeenCalledTimes(1);
      expect(chart.unsubscribeSize).toHaveBeenCalledExactlyOnceWith(
        chart.subscribeSize.mock.calls[0]![0],
      );
    }
  });
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
      expect(chart.unsubscribeClick).toHaveBeenCalledExactlyOnceWith(
        chart.subscribeClick.mock.calls[0]?.[0],
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
    fireEvent.pointerEnter(view.getByTestId('price-chart'));
    act(() =>
      chart.subscribeCrosshairMove.mock.calls[0]![0]({
        time: latest.time,
        point: { x: 1, y: 1 },
      }),
    );
    expect(cursor).toHaveBeenLastCalledWith(null);
    act(() =>
      chart.subscribeCrosshairMove.mock.calls[0]![0]({
        time: latest.time,
        point: { x: 1, y: 1 },
        sourceEvent: {},
      }),
    );
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
