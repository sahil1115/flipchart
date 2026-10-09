// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { IndicatorControls } from './IndicatorControls';
import { IndicatorCard } from './IndicatorCard';
import { calculate, defaults } from '../../indicators/core';
import { definitions, defaultVisibility } from '../../indicators/presentation';
import reference from '../../../tests/fixtures/indicator-reference.json';
import type { Candle } from '../../data/types';
const bars = reference.candles as Candle[];
afterEach(cleanup);
it('keeps the last valid parameters on invalid edits, then applies and resets valid values', () => {
  const apply = vi.fn(),
    visibility = vi.fn();
  render(
    <IndicatorControls
      parameters={defaults}
      onParameters={apply}
      visible={defaultVisibility}
      onVisibility={visibility}
      items={definitions(calculate(bars, defaults), defaults)}
    />,
  );
  fireEvent.change(screen.getByLabelText('MACD fast period'), {
    target: { value: '26' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply parameters' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Last valid calculations remain',
  );
  expect(apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('MACD fast period'), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply parameters' }));
  expect(apply).toHaveBeenLastCalledWith({ ...defaults, macdFast: 10 });
  fireEvent.click(
    screen.getByRole('button', { name: 'Reset calculation parameters' }),
  );
  expect(apply).toHaveBeenLastCalledWith(defaults);
  fireEvent.click(screen.getByRole('checkbox', { name: 'OBV' }));
  expect(visibility).toHaveBeenCalledWith({ ...defaultVisibility, obv: true });
});
it('shows zero as a valid value and actual earlier latest date for incomplete candles', () => {
  const candles = bars.slice(0, 40).map((bar, i) => ({
    ...bar,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: 0,
    incomplete: i === 39,
  }));
  const item = definitions(calculate(candles, defaults), defaults).find(
    (item) => item.id === 'rsi',
  )!;
  const view = render(
    <IndicatorCard
      item={item}
      candles={candles}
      cursor={null}
      currency="USD"
    />,
  );
  expect(screen.getByText('0', { exact: true })).toBeVisible();
  expect(screen.getByText(/Latest valid/)).toHaveTextContent(candles[38]!.time);
  expect(screen.getByText(/earlier than latest/)).toBeVisible();
  view.rerender(
    <IndicatorCard
      item={item}
      candles={candles}
      cursor={candles[39]!.time}
      currency="USD"
    />,
  );
  expect(screen.getByText('Unavailable')).toBeVisible();
});
it('exposes unavailable short history and missing-volume cumulative results separately', () => {
  const candles = bars
    .slice(0, 40)
    .map((bar, i) => ({ ...bar, volume: i === 39 ? null : bar.volume }));
  const items = definitions(calculate(candles, defaults), defaults);
  render(
    <IndicatorCard
      item={items.find((item) => item.id === 'sma')!}
      candles={candles}
      cursor={null}
      currency="USD"
    />,
  );
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  expect(
    screen.getAllByText(/Needs 200 finalized bars/).length,
  ).toBeGreaterThan(0);
  cleanup();
  render(
    <IndicatorCard
      item={items.find((item) => item.id === 'obv')!}
      candles={candles}
      cursor={null}
      currency="USD"
    />,
  );
  expect(screen.getByText(/earlier than latest candle/)).toHaveTextContent(
    candles[38]!.time,
  );
  expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
});
