import { expect, test } from '@playwright/test';
// Provider routing is tested separately from real service-worker integration.
// Browser engines cannot consistently intercept SW-controlled external fetches.
test.use({ serviceWorkers: 'block' });

import { readFile } from 'node:fs/promises';

import Papa from 'papaparse';

import {
  alphaCredential,
  alphaHistory,
  alphaSearch,
} from '../fixtures/alpha-vantage';

import type { Page } from '@playwright/test';

async function alpha(page: Page) {
  const requests: string[] = [];

  let failure: string | null = null;

  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));

  await page.route('https://www.alphavantage.co/query?**', async (route) => {
    const url = new URL(route.request().url());

    requests.push(url.searchParams.get('function')!);

    expect(url.searchParams.get('apikey')).toBe(alphaCredential);

    const interval = url.searchParams.get('function')?.endsWith('WEEKLY')
      ? 'weekly'
      : url.searchParams.get('function')?.endsWith('MONTHLY')
        ? 'monthly'
        : 'daily';

    await route.fulfill({
      contentType: 'application/json',

      headers: { 'Access-Control-Allow-Origin': '*' },

      body: JSON.stringify(
        failure
          ? { Information: failure }
          : url.searchParams.get('function') === 'SYMBOL_SEARCH'
            ? alphaSearch
            : alphaHistory(interval),
      ),
    });
  });

  await page.goto('/');

  await page

    .getByRole('button', { name: 'Data connection', exact: true })

    .click();

  await page.getByLabel('Market data provider').selectOption('alpha-vantage');

  await page.getByLabel('Alpha Vantage API key').fill(alphaCredential);

  await page.getByLabel('Remember on this device').check();

  await page.getByRole('button', { name: 'Use key', exact: true }).click();

  return {
    requests,

    fail: (value: string | null) => {
      failure = value;
    },
  };
}

async function select(page: Page) {
  await page

    .getByLabel('Search symbol or company', { exact: true })

    .fill('FIX');

  await page.getByRole('button', { name: /FIX.LON · Region:/ }).click();
}

test('Alpha Vantage compact, weekly and monthly load manually; premium errors retain stale data; no fallback or key export', async ({
  page,
}) => {
  const fixture = await alpha(page);

  await select(page);

  await expect(page.getByLabel('Provider price adjustment')).toBeDisabled();

  await page.getByRole('button', { name: 'Load history', exact: true }).click();

  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('100 bars');

  await expect(
    page.getByRole('article', { name: 'SMA', exact: true }),
  ).toContainText('Unavailable');

  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('Alpha Vantage daily');
  const calls = fixture.requests.length;

  await page.getByRole('button', { name: '1M', exact: true }).click();

  expect(fixture.requests).toHaveLength(calls);

  for (const interval of ['weekly', 'monthly']) {
    await page

      .getByLabel('Provider interval', { exact: true })

      .selectOption(interval);

    await page

      .getByRole('button', { name: 'Load history', exact: true })

      .click();

    await expect(
      page

        .getByRole('status')

        .filter({ hasText: `Loaded 100 ${interval} bars` }),
    ).toBeVisible();
  }

  fixture.fail(`premium outputsize=full ${alphaCredential}`);

  await page

    .getByRole('button', { name: 'Refresh loaded data', exact: true })

    .click();

  await expect(page.getByRole('alert')).toContainText(
    'different account access',
  );

  await expect(page.locator('body')).not.toContainText(alphaCredential);

  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('100 bars');

  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();

  const download = await downloadPromise;

  const csv = await readFile((await download.path())!, 'utf8');

  expect(csv).not.toContain(alphaCredential);

  expect(
    Papa.parse<Record<string, string>>(csv, { header: true }).data[0],
  ).toMatchObject({
    provider: 'alpha-vantage',

    interval: 'monthly',

    currency: 'GBP',

    adjustment: 'raw',
  });
});

test('watchlist selection fetches only after Load; remembered credentials remain isolated and Disconnect clears the chosen session', async ({
  page,
}) => {
  const fixture = await alpha(page);

  await select(page);

  await page

    .getByRole('button', { name: 'Add selected listing to watchlist' })

    .click();

  const count = fixture.requests.length;

  await page.getByRole('button', { name: 'Select watchlist FIX.LON' }).click();

  expect(fixture.requests).toHaveLength(count);

  await page.getByRole('button', { name: 'Load history', exact: true }).click();

  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toBeVisible();

  await page.getByLabel('Market data provider').selectOption('twelve-data');

  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toHaveCount(0);

  await expect(page.getByLabel('Twelve Data API key')).toHaveValue('');

  await page.getByLabel('Market data provider').selectOption('alpha-vantage');

  await expect(page.getByLabel('Alpha Vantage API key')).toHaveValue(
    alphaCredential,
  );

  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();

  await expect(page.getByLabel('Alpha Vantage API key')).toHaveValue('');

  expect(
    await page.evaluate(() =>
      localStorage.getItem('flipchart:credential:alpha-vantage'),
    ),
  ).toBeNull();

  await expect(
    page.getByRole('button', { name: 'Select watchlist FIX.LON' }),
  ).toBeDisabled();

  await page.reload();

  await page

    .getByRole('button', { name: 'Data connection', exact: true })

    .click();

  await page.getByLabel('Market data provider').selectOption('alpha-vantage');

  await expect(
    page.getByRole('button', { name: 'Select watchlist FIX.LON' }),
  ).toBeDisabled();

  expect(
    fixture.requests.filter((value) => value.startsWith('TIME_SERIES')),
  ).toHaveLength(1);
});

test('keyboard layout and parameters persist across reload; reset restores defaults and leaves data available', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Try Demo/ }).click();

  await page.getByText('Calculation parameters', { exact: true }).click();

  const input = page.getByLabel('RSI period', { exact: true });

  await input.focus();

  await input.fill('7');

  await page

    .getByRole('button', { name: 'Apply parameters', exact: true })

    .focus();

  await page.keyboard.press('Enter');

  const collapse = page.getByRole('button', {
    name: 'Collapse RSI 7 details',

    exact: true,
  });

  await collapse.focus();

  await page.keyboard.press('Enter');

  await page

    .getByRole('button', { name: 'Expand MACD 12, 26, 9 panel', exact: true })

    .click();

  await page.getByLabel('OBV', { exact: true }).focus();

  await page.keyboard.press('Space');

  await page.reload();

  await expect(
    page.getByRole('button', { name: 'Show RSI 7 details', exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole('button', {
      name: 'Restore MACD 12, 26, 9 panel',

      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');

  await expect(
    page.getByRole('article', { name: 'OBV', exact: true }),
  ).toBeVisible();

  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.screenshot({
      path: testInfo.outputPath(`phase-6-layout-${width}.png`),

      fullPage: true,
    });
  }

  await page

    .getByRole('button', { name: 'Reset panel layout and parameters' })

    .click();

  await expect(
    page.getByRole('article', { name: 'RSI 14', exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole('article', { name: 'OBV', exact: true }),
  ).toHaveCount(0);

  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('780 bars');
});

test('CSV full/visible and metadata downloads match selected interval, parameters and chart view', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: /Try Demo/ }).click();

  await page.getByRole('button', { name: '1M', exact: true }).click();

  const downloadRows = async () => {
    const waiting = page.waitForEvent('download');

    await page

      .getByRole('button', { name: 'Download CSV', exact: true })

      .click();

    return Papa.parse<Record<string, string>>(
      await readFile((await (await waiting).path())!, 'utf8'),

      { header: true },
    ).data;
  };

  const full = await downloadRows();

  expect(full).toHaveLength(780);

  await page

    .getByLabel('Export scope', { exact: true })

    .selectOption('visible');

  const visible = await downloadRows();

  expect(visible.length).toBeLessThan(40);

  expect(visible.length).toBeGreaterThan(10);

  expect(visible).toEqual(full.slice(-visible.length));

  const chart = page.getByTestId('price-chart');

  await chart.evaluate((element) => element.scrollIntoView({ block: 'start' }));

  const bounds = (await chart.boundingBox())!;

  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);

  await page.mouse.down();

  await page.mouse.move(bounds.x + bounds.width / 2 + 150, bounds.y + 100, {
    steps: 8,
  });

  await page.mouse.up();

  const panned = await downloadRows();

  expect(panned[0]!.date).not.toBe(visible[0]!.date);

  expect(panned).toEqual(
    full.filter(
      (row) =>
        row.date! >= panned[0]!.date! && row.date! <= panned.at(-1)!.date!,
    ),
  );

  await page.getByLabel('Interval', { exact: true }).selectOption('weekly');

  const weekly = await downloadRows();

  expect(weekly[0]!.interval).toBe('weekly');

  const metadataPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Download export metadata' }).click();

  const metadata = JSON.parse(
    await readFile((await (await metadataPromise).path())!, 'utf8'),
  );

  expect(metadata).toMatchObject({
    scope: 'visible',

    rows: weekly.length,

    dataset: { interval: 'weekly', adjustment: 'synthetic' },

    parameters: { rsiPeriod: 14 },
  });
});
