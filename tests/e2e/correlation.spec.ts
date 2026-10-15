import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
test.use({ serviceWorkers: 'block' });

/** Deterministic Yahoo-shaped daily history for any symbol and requested window. */
function history(symbol: string, from: string, to: string) {
  const india = symbol.endsWith('.NS');
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const timestamp: number[] = [];
  const close: number[] = [];
  let price = 100 + (seed % 50);
  let step = 0;
  for (
    const day = new Date(`${from}T00:00:00Z`);
    day <= new Date(`${to}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if ([0, 6].includes(day.getUTCDay())) continue;
    step++;
    price *=
      1 + 0.01 * Math.sin(step * 0.7) + 0.006 * Math.sin(step * (seed % 7));
    timestamp.push(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        india ? 4 : 14,
        30,
      ) / 1000,
    );
    close.push(Number(price.toFixed(2)));
  }
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol,
            currency: india ? 'INR' : 'USD',
            exchangeTimezoneName: india ? 'Asia/Kolkata' : 'America/New_York',
            instrumentType: 'EQUITY',
            dataGranularity: '1d',
          },
          timestamp,
          indicators: { quote: [{ close }] },
        },
      ],
    },
  };
}

async function mockRelay(page: Page, failing: string[] = []) {
  const requested: string[] = [];
  await page.route('**/api/yahoo/history?*', async (route: Route) => {
    const url = new URL(route.request().url());
    const symbol = url.searchParams.get('symbol')!;
    requested.push(symbol);
    await route.fulfill(
      failing.includes(symbol)
        ? { status: 404, json: { error: { category: 'unsupported-listing' } } }
        : {
            json: history(
              symbol,
              url.searchParams.get('from')!,
              url.searchParams.get('to')!,
            ),
          },
    );
  });
  return requested;
}

async function trackViolations(page: Page) {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = store;
    document.addEventListener('securitypolicyviolation', (event) =>
      store.push(event.violatedDirective),
    );
  });
  return () =>
    page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

const heatmap = (page: Page) => page.getByTestId('correlation-heatmap');

for (const width of [375, 1440])
  test(`heatmap loads US and NSE industries on demand at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const violations = await trackViolations(page);
    const requested = await mockRelay(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Correlation heatmap' }).click();
    await expect(page).toHaveURL(/#correlation$/);
    await expect(
      page.getByRole('heading', { name: 'Correlation heatmap' }),
    ).toBeVisible();
    expect(requested).toEqual([]);

    await page.getByLabel('Market').selectOption({ label: 'S&P 500' });
    await page
      .getByLabel('Industry')
      .selectOption({ label: 'Information technology' });
    await page.getByRole('button', { name: 'Top 5' }).click();
    await expect(page.getByLabel('Tickers')).toHaveValue(
      'NVDA, MSFT, AAPL, AVGO, ORCL',
    );
    await page.getByRole('button', { name: 'Load correlation' }).click();
    await expect(heatmap(page).locator('tbody tr')).toHaveCount(5);
    const card = page.getByTestId('heatmap-card');
    await expect(card).toContainText('Prepared by FlipChart');
    await expect(card).toContainText('Data: Yahoo Finance (unofficial)');
    expect(requested.sort()).toEqual(['AAPL', 'AVGO', 'MSFT', 'NVDA', 'ORCL']);
    await expect(heatmap(page).locator('caption')).toContainText(
      'daily returns, 30 trading days',
    );
    for (let i = 0; i < 5; i++)
      await expect(
        heatmap(page).locator('tbody tr').nth(i).locator('td').nth(i),
      ).toHaveText('1.00');
    await expect(
      page.locator('.correlation-page').getByRole('status').first(),
    ).toContainText('over 30 daily returns');

    await page.getByLabel('Market').selectOption({ label: 'NSE India' });
    await page.getByLabel('Industry').selectOption({ label: 'Banking' });
    await page.getByRole('button', { name: 'Top 10' }).click();
    await page.getByRole('button', { name: '15 days' }).click();
    await page.getByRole('button', { name: 'Load correlation' }).click();
    await expect(heatmap(page).locator('tbody tr')).toHaveCount(10);
    await expect(heatmap(page).locator('caption')).toContainText(
      'NSE India · Banking',
    );
    await expect(heatmap(page).locator('caption')).toContainText(
      '15 trading days',
    );
    expect(requested.filter((symbol) => symbol.endsWith('.NS'))).toHaveLength(
      10,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/correlation-${width}.png`,
      fullPage: true,
    });
    expect(await violations()).toEqual([]);
  });

test('copies the branded heatmap as a PNG image and downloads it as JPG', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Clipboard image permissions are Chromium-only in Playwright.',
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockRelay(page);
  await page.goto('/#correlation');
  await page.getByLabel('Industry').selectOption({ label: 'Financials' });
  await page.getByRole('button', { name: 'Load correlation' }).click();
  await expect(heatmap(page).locator('tbody tr')).toHaveCount(10);

  await page.getByRole('button', { name: 'Copy image' }).click();
  await expect(page.getByText(/Heatmap image copied/)).toBeVisible();
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
  // Rendered at 2x for sharp pasting.
  expect(copied.width).toBeGreaterThan(1000);
  expect(copied.height).toBeGreaterThan(800);
  writeFileSync(
    'verification/screenshots/correlation-copied.png',
    Buffer.from(copied.data, 'base64'),
  );

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JPG' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^flipchart-correlation-returns-30d-\d{4}-\d{2}-\d{2}\.jpg$/,
  );
  const jpg = readFileSync((await file.path())!);
  expect([...jpg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  writeFileSync('verification/screenshots/correlation-download.jpg', jpg);
});

test('failed tickers are excluded and named; Back returns to the retained chart', async ({
  page,
}) => {
  await mockRelay(page, ['MSFT']);
  await page.goto('/');
  await page.getByRole('button', { name: /Try Demo/ }).click();
  const chart = page.getByTestId('price-chart');
  await expect(chart.locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Correlation heatmap' }).click();
  await expect(chart).toBeHidden();
  await page.getByRole('button', { name: 'Top 5' }).click();
  await page.getByRole('button', { name: 'Load correlation' }).click();
  await expect(heatmap(page).locator('tbody tr')).toHaveCount(4);
  await expect(page.getByText(/Not loaded and excluded: MSFT/)).toBeVisible();

  await page.getByLabel('Tickers').fill('AAPL, ../etc');
  await page.getByRole('button', { name: 'Load correlation' }).click();
  await expect(page.getByRole('alert')).toContainText('Not a valid');

  await page.getByRole('button', { name: 'Back to chart' }).click();
  await expect(page).not.toHaveURL(/#correlation/);
  await expect(chart.locator('canvas').first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('FLIP');
  // Browser history moves between the two views.
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Correlation heatmap' }),
  ).toBeVisible();
  await page.goBack();
  await expect(chart.locator('canvas').first()).toBeVisible();
});
