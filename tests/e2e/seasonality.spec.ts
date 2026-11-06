import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { yahooSearch } from '../fixtures/yahoo-finance';
test.use({ serviceWorkers: 'block' });

/** The app's "today" in these tests: a Wednesday in the middle of January. */
const today = new Date('2025-01-15T12:00:00Z');

/**
 * Month-end level on a fixed ladder: every month is +1% on the one before,
 * except December, which is −10%. Prices are constant inside a month, so each
 * month's return is known exactly whatever date range is requested.
 */
const levels = new Map<string, number>();
{
  let level = 100;
  for (let year = 2000; year <= 2026; year++)
    for (let month = 1; month <= 12; month++) {
      if (year > 2000 || month > 1) level *= month === 12 ? 0.9 : 1.01;
      levels.set(`${year}-${String(month).padStart(2, '0')}`, level);
    }
}
function yahooMonthly(symbol: string, from: string, to: string) {
  const timestamp: number[] = [];
  const close: number[] = [];
  for (
    const day = new Date(`${from}T00:00:00Z`);
    day <= new Date(`${to}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if ([0, 6].includes(day.getUTCDay())) continue;
    timestamp.push(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 15) /
        1000,
    );
    close.push(Number(levels.get(day.toISOString().slice(0, 7))!.toFixed(6)));
  }
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol,
            currency: 'USD',
            exchangeName: 'NMS',
            exchangeTimezoneName: 'America/New_York',
            instrumentType: 'EQUITY',
            dataGranularity: '1d',
            longName: `${symbol} Inc.`,
          },
          timestamp,
          indicators: {
            quote: [
              {
                open: close,
                high: close.map((value) => value + 1),
                low: close.map((value) => value - 1),
                close,
                volume: close.map(() => 1000),
              },
            ],
          },
        },
      ],
    },
  };
}

/** Routes Yahoo search and history; the result records every history call. */
async function mockYahoo(page: Page) {
  const requested: { symbol: string; from: string; to: string }[] = [];
  await page.route('**/api/yahoo/search?*', (route) =>
    route.fulfill({
      json: yahooSearch(
        { symbol: 'AAPL', exchange: 'NMS', name: 'Apple Inc.' },
        { symbol: 'MSFT', exchange: 'NMS', name: 'Microsoft Corporation' },
        {
          symbol: 'RELIANCE.NS',
          exchange: 'NSI',
          name: 'Reliance Industries Limited',
        },
      ),
    }),
  );
  await page.route('**/api/yahoo/history?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const item = {
      symbol: params.get('symbol')!,
      from: params.get('from')!,
      to: params.get('to')!,
    };
    requested.push(item);
    return route.fulfill({
      json: yahooMonthly(item.symbol, item.from, item.to),
    });
  });
  return requested;
}

async function start(page: Page) {
  await page.clock.setFixedTime(today);
  const requested = await mockYahoo(page);
  await page.goto('/');
  return requested;
}
async function openMonthly(page: Page) {
  await page
    .getByRole('link', { name: 'Monthly returns', exact: true })
    .click();
  await expect(page).toHaveURL(/#monthly$/);
  await expect(
    page.getByRole('heading', { name: 'Monthly returns', exact: true }),
  ).toBeVisible();
}
const table = (page: Page) => page.getByTestId('seasonality-table');
/** Picks a US stock on the Monthly returns page and loads it. */
async function chooseStock(
  page: Page,
  query: string,
  symbol: string,
  years?: string,
) {
  await page.getByLabel('Country').selectOption('us');
  await page.getByLabel('Search stock for monthly returns').fill(query);
  await page
    .getByRole('button', { name: new RegExp(`^${symbol} · NASDAQ`) })
    .click();
  if (years) await page.getByLabel('History length').selectOption(years);
  await page.getByRole('button', { name: 'Load monthly returns' }).click();
  await expect(table(page)).toBeVisible();
}
const bodyRows = (page: Page) =>
  table(page).locator('tbody:not(.seasonality-stats) tr');
const bodyRow = (page: Page, year: number) =>
  bodyRows(page).filter({
    has: page.getByRole('rowheader', { name: String(year), exact: true }),
  });
const statRow = (page: Page, name: string) =>
  table(page).locator('.seasonality-stats tr', {
    has: page.getByRole('rowheader', { name, exact: true }),
  });
const texts = (row: ReturnType<typeof bodyRow>) =>
  row.locator('td').allInnerTexts();
const yearChange = 100 * (1.01 ** 11 * 0.9 - 1);
const signed = (value: number) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('searches a stock on this page and shows each month with averages and shares', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requested = await start(page);
  await openMonthly(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'No stock chosen yet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Load monthly returns' }),
  ).toBeDisabled();
  expect(requested).toEqual([]);

  await chooseStock(page, 'apple', 'AAPL', '3');
  // One request, for the chosen stock, with a month of warm-up before three years.
  expect(requested).toEqual([
    { symbol: 'AAPL', from: '2021-12-11', to: '2025-01-15' },
  ]);
  const card = page.getByTestId('seasonality-card');
  await expect(card).toContainText('AAPL · Monthly returns');
  await expect(card).toContainText('Prepared by FlipChart');
  await expect(card).toContainText('Data: Yahoo Finance');
  await expect(card).toContainText('prices as supplied');

  // Newest year first; the data starts in December 2021.
  expect(
    await table(page)
      .locator('tbody:not(.seasonality-stats) tr th')
      .allInnerTexts(),
  ).toEqual(['2025', '2024', '2023', '2022', '2021']);
  await expect(table(page).locator('thead th')).toHaveText([
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
    'Year',
  ]);
  const complete = [...Array(11).fill('+1.0'), '−10.0', signed(yearChange)];
  expect(await texts(bodyRow(page, 2024))).toEqual(complete);
  expect(await texts(bodyRow(page, 2023))).toEqual(complete);
  // 2022 follows the December 2021 close, so even January is known.
  expect(await texts(bodyRow(page, 2022))).toEqual(complete);
  // 2021 holds only the first month of the data, which has no previous close.
  expect(await texts(bodyRow(page, 2021))).toEqual(Array(13).fill('–'));
  // January 2025 is still in progress, and so is the year.
  expect(await texts(bodyRow(page, 2025))).toEqual([
    '+1.0',
    ...Array(11).fill('–'),
    '+1.0',
  ]);
  await expect(table(page).locator('td.in-progress')).toHaveCount(2);
  await expect(card).toContainText('Dashed outline: month still in progress');

  // Three complete Januaries and Decembers: averages and shares appear, and the
  // January in progress is left out.
  expect((await texts(statRow(page, 'Average')))[0]).toBe('+1.0');
  expect((await texts(statRow(page, 'Up months')))[0]).toBe('100%');
  expect((await texts(statRow(page, 'Average')))[11]).toBe('−10.0');
  expect((await texts(statRow(page, 'Up months')))[11]).toBe('0%');
  await expect(statRow(page, 'Average').locator('td').nth(0)).toHaveAttribute(
    'title',
    /average of 3 complete months/,
  );
  // Every cell names its month and exact value, so colour is never the only cue.
  await expect(bodyRow(page, 2023).locator('td').nth(11)).toHaveAttribute(
    'title',
    'Dec 2023: -10.00%',
  );
  expect(await noOverflow(page)).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'verification/screenshots/seasonality-1440.png',
    fullPage: true,
  });
});

test('uses the heatmap colour setting and stays inside a phone screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await start(page);
  await openMonthly(page);
  await page.getByLabel('Country').selectOption('us');
  await page.getByLabel('Search stock for monthly returns').fill('apple');
  const result = page.getByRole('button', { name: /^AAPL · NASDAQ/ });
  await expect(result).toBeVisible();
  // The picker and its matches fit a phone before anything is loaded.
  expect(await noOverflow(page)).toBe(true);
  await result.click();
  await page.getByLabel('History length').selectOption('3');
  await page.getByRole('button', { name: 'Load monthly returns' }).click();
  await expect(table(page)).toBeVisible();
  const december = () =>
    bodyRow(page, 2023)
      .locator('td')
      .nth(11)
      .evaluate((node) => getComputedStyle(node).backgroundColor);
  // A strong fall is orange on the default blue and orange scale.
  const [r1, , b1] = (await december()).match(/\d+/g)!.map(Number);
  expect(r1).toBeGreaterThan(b1!);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('region', { name: 'Settings' })
    .getByRole('radio', { name: 'Green & red' })
    .check();
  await page.keyboard.press('Escape');
  // On green and red the same fall is red: red high, green and blue low.
  const [r2, g2, b2] = (await december()).match(/\d+/g)!.map(Number);
  expect(r2).toBeGreaterThan(g2!);
  expect(r2).toBeGreaterThan(b2!);
  expect(g2).toBeLessThan(r1!);

  // The wide table scrolls inside its card rather than the page.
  expect(await noOverflow(page)).toBe(true);
  await page.getByTestId('seasonality-card').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'verification/screenshots/seasonality-375.png',
    fullPage: true,
  });
});

test('copies the branded image and downloads JPG and CSV', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Clipboard image permissions are Chromium-only in Playwright.',
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  await openMonthly(page);
  await chooseStock(page, 'apple', 'AAPL', '3');

  await page.getByRole('button', { name: 'Copy image', exact: true }).click();
  await expect(page.getByText(/Monthly returns image copied/)).toBeVisible();
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType('image/png');
    const bitmap = await createImageBitmap(blob);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      types: item!.types,
      width: bitmap.width,
      height: bitmap.height,
      png: Array.from(bytes.slice(0, 8)),
      data: btoa(
        Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''),
      ),
    };
  });
  expect(copied.types).toContain('image/png');
  expect(copied.png).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(copied.width).toBeGreaterThan(1200);
  expect(copied.height).toBeGreaterThan(450);
  writeFileSync(
    'verification/screenshots/seasonality-copied.png',
    Buffer.from(copied.data, 'base64'),
  );

  const jpgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JPG', exact: true }).click();
  const jpgFile = await jpgDownload;
  // The last complete close is the 14th: the 15th is today and provisional.
  expect(jpgFile.suggestedFilename()).toBe(
    'flipchart-AAPL-monthly-returns-2025-01-14.jpg',
  );
  expect([...readFileSync((await jpgFile.path())!).subarray(0, 3)]).toEqual([
    0xff, 0xd8, 0xff,
  ]);

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download monthly CSV' }).click();
  const csvFile = await csvDownload;
  expect(csvFile.suggestedFilename()).toBe(
    'flipchart-AAPL-monthly-returns-2025-01-14.csv',
  );
  const csv = readFileSync((await csvFile.path())!, 'utf8')
    .trim()
    .split('\r\n');
  expect(csv[0]).toBe(
    'Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,Year change %,Note',
  );
  // Newest year first, five years, then the two statistic rows.
  expect(csv.map((line) => line.split(',')[0])).toEqual([
    'Year',
    '2025',
    '2024',
    '2023',
    '2022',
    '2021',
    'Average',
    'Up months %',
  ]);
  expect(csv[1]).toMatch(/^2025,1,,,,,,,,,,,,1,in progress: Jan$/);
  const cells = csv[3]!.split(',');
  expect(cells.slice(1, 12).every((value) => Number(value) > 0.99)).toBe(true);
  expect(Number(cells[12])).toBeCloseTo(-10, 3);
  expect(Number(cells[13])).toBeCloseTo(yearChange, 3);
  // The first month of the data has no previous close, so its cells are empty.
  expect(
    csv[5]!
      .split(',')
      .slice(1, 14)
      .every((value) => value === ''),
  ).toBe(true);
  const average = csv[6]!.split(',');
  expect(Number(average[1])).toBeCloseTo(1, 3);
  expect(Number(average[12])).toBeCloseTo(-10, 3);
  expect(csv[7]!.split(',').slice(1, 13)).toEqual([
    '100',
    ...Array(10).fill('100'),
    '0',
  ]);
});

test('has its own stock, separate from the Chart tab, and can copy it once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  const summary = page.getByRole('region', { name: 'Dataset summary' });
  await expect(summary).toContainText('FLIP');
  // The Chart page no longer carries the grid.
  await expect(
    page.getByRole('heading', { name: 'Monthly returns', exact: true }),
  ).toHaveCount(0);

  await openMonthly(page);
  const copy = page.getByRole('button', {
    name: 'Copy FLIP from the Chart tab',
  });
  await expect(copy).toBeVisible();
  // Nothing is shown until a stock is chosen here, whatever the chart holds.
  await expect(table(page)).toHaveCount(0);

  await chooseStock(page, 'apple', 'AAPL', '3');
  await expect(page.getByTestId('seasonality-card')).toContainText(
    'AAPL · Monthly returns',
  );
  // Choosing a stock here left the chart alone.
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(summary).toContainText('FLIP');
  await expect(summary).not.toContainText('AAPL');

  // The AAPL grid is kept while the chart is open, and the chart's stock can
  // be copied across as a one-time copy.
  await openMonthly(page);
  await expect(page.getByTestId('seasonality-card')).toContainText(
    'AAPL · Monthly returns',
  );
  await copy.click();
  await expect(page.getByTestId('seasonality-card')).toContainText(
    'FLIP · Monthly returns',
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'Copied FLIP' }),
  ).toBeVisible();
  await expect(copy).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(summary).toContainText('FLIP');
});

test('history length changes the request, and a failed load keeps the grid', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requested = await start(page);
  await openMonthly(page);
  await chooseStock(page, 'apple', 'AAPL');
  // Ten years is the default.
  expect(requested.at(-1)!.from).toBe('2014-12-11');
  await expect(bodyRows(page)).toHaveCount(12);

  await page.getByLabel('History length').selectOption('15');
  await page.getByRole('button', { name: 'Load monthly returns' }).click();
  await expect(bodyRows(page)).toHaveCount(17);
  expect(requested.at(-1)!.from).toBe('2009-12-11');

  await page.route('**/api/yahoo/history?*', (route) =>
    route.fulfill({
      status: 429,
      json: { error: { category: 'quota-exhausted' } },
    }),
  );
  // The same stock and length is answered from this session's cache, so ask
  // for a different length to reach the failing relay.
  await page.getByLabel('History length').selectOption('5');
  await page.getByRole('button', { name: 'Load monthly returns' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'The monthly returns shown are unchanged' }),
  ).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(17);
});

test('the country decides which stocks are found', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  await openMonthly(page);
  await page.getByLabel('Search stock for monthly returns').fill('re');
  await expect(
    page.getByRole('button', { name: /^RELIANCE.NS · NSE/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^AAPL/ })).toHaveCount(0);
  await page.getByLabel('Country').selectOption('us');
  // Changing country clears the old matches until a new search is typed.
  await expect(page.getByRole('button', { name: /^RELIANCE/ })).toHaveCount(0);
  await page.getByLabel('Search stock for monthly returns').fill('apple');
  await expect(
    page.getByRole('button', { name: /^AAPL · NASDAQ/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^RELIANCE/ })).toHaveCount(0);
});

test('the tab follows Performance and starts empty on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await start(page);
  const tabs = await page
    .getByRole('navigation', { name: 'Pages' })
    .getByRole('link')
    .allInnerTexts();
  expect(tabs).toEqual([
    'Chart',
    'Correlation',
    'Sector rotation',
    'Performance',
    'Monthly returns',
  ]);
  await openMonthly(page);
  await expect(
    page.getByRole('status').filter({ hasText: 'No stock chosen yet' }),
  ).toBeVisible();
  // Without a chart stock there is nothing to copy.
  await expect(
    page.getByRole('button', { name: /^Copy .* from the Chart/ }),
  ).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(
    page.getByRole('link', { name: 'Chart', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { name: 'Monthly returns', exact: true }),
  ).toHaveCount(0);
});
