vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));
// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  cleanup,
  act,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { createDemoDataset } from '../demo/dataset';
import { DatasetRepository } from '../storage/datasets';
import { fixtureDataset } from '../../tests/fixtures/dataset';
function repository() {
  return new DatasetRepository({
    read: async () => null,
    write: async () => {},
  });
}
vi.mock('../charts/PriceChart', () => ({
  PriceChart: () => <div>Chart ready</div>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('shows explicit initial, loading and empty states', async () => {
  const dataset = createDemoDataset('2026-10-09T00:00:00Z');
  let finish: (value: typeof dataset) => void = () => {};
  render(
    <App
      repository={repository()}
      demoLoader={() =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  expect(screen.getByRole('button', { name: /Try Demo/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Try Demo/ }));
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  finish({
    ...dataset,
    candles: [],
    metadata: { ...dataset.metadata, coverage: null, latestCandleTime: null },
  });
  expect(await screen.findByText('No candles available')).toBeVisible();
});
it('handles a failed load and lets the user retry', async () => {
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error('fixture failure'))
    .mockResolvedValueOnce(createDemoDataset('2026-10-09T00:00:00Z'));
  render(<App demoLoader={loader} repository={repository()} />);
  fireEvent.click(screen.getByRole('button', { name: /Try Demo/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load the demo',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Chart ready')).toBeVisible();
  expect(loader).toHaveBeenCalledTimes(2);
});
it('provides an unexpected render error recovery screen', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken() {
    throw new Error('render fixture');
    return null;
  }
  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Something unexpected happened',
  );
  expect(
    screen.getByRole('button', { name: 'Reload FlipChart' }),
  ).toBeVisible();
  log.mockRestore();
});
it('restores the selected import but a slow restore cannot overwrite a new user selection', async () => {
  const saved = fixtureDataset();
  const store = new DatasetRepository({
    read: async () => ({
      version: 1,
      datasets: [saved],
      selectedId: saved.metadata.id,
    }),
    write: async () => {},
  });
  const view = render(<App repository={store} />);
  expect(await screen.findByText('Chart ready')).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Dataset summary' }),
  ).toHaveTextContent('FIXTURE');
  view.unmount();
  let finish: (value: unknown) => void = () => {};
  const slow = new DatasetRepository({
    read: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    write: async () => {},
  });
  render(
    <App
      repository={slow}
      demoLoader={async () => createDemoDataset('2026-10-09T00:00:00Z')}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Try Demo/ }));
  expect(await screen.findByText('Chart ready')).toBeVisible();
  await act(async () => {
    finish({ version: 1, datasets: [saved], selectedId: saved.metadata.id });
  });
  expect(
    screen.getByRole('region', { name: 'Dataset summary' }),
  ).toHaveTextContent('FLIP');
});
