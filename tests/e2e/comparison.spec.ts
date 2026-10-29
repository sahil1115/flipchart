import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
test.use({ serviceWorkers: 'block' });

/** Steady trends per symbol so the ranking is known: NVDA best, GOOGL worst. */
const trend: Record<string, number> = {
  NVDA: 0.3,
  MSFT: 0.2,
  AAPL: 0.1,
  AMZN: 0,
  GOOGL: -0.1,
  SPY: 0.05,
};
function history(symbol: string, from: string, to: string) {
  const timestamp: number[] = [];
  const close: number[] = [];
  let step = 0;
  for (
    const day = new Date(`${from}T00:00:00Z`);
    day <= new Date(`${to}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if ([0, 6].includes(day.getUTCDay())) continue;
    step++;
    timestamp.push(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        14,
        30,
      ) / 1000,
    );
    close.push(
      Number(
        (
          100 * (1 + ((trend[symbol] ?? 0) * step) / 250) +
          Math.sin(step / 3)
        ).toFixed(4),
      ),
    );
  }
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol,
            currency: 'USD',
            exchangeTimezoneName: 'America/New_York',
            instrumentType: symbol === 'SPY' ? 'ETF' : 'EQUITY',
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
  const requested: { symbol: string; from: string }[] = [];
  await page.route('**/api/yahoo/history?*', async (route: Route) => {
    const url = new URL(route.request().url());
    const symbol = url.searchParams.get('symbol')!;
    const from = url.searchParams.get('from')!;
    requested.push({ symbol, from });
    await route.fulfill(
      failing.includes(symbol)
        ? { status: 404, json: { error: { category: 'unsupported-listing' } } }
        : { json: history(symbol, from, url.searchParams.get('to')!) },
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
const table = (page: Page) => page.getByTestId('performance-table');
const lines = (page: Page) =>
  page.getByTestId('performance-chart').locator('polyline');

for (const width of [375, 1440])
  test(`performance comparison ranks stocks against the index at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const violations = await trackViolations(page);
    const requested = await mockRelay(page);
    await page.goto('/');
    const tab = page.getByRole('link', { name: 'Performance' });
    await tab.click();
    await expect(page).toHaveURL(/#performance$/);
    await expect(tab).toHaveAttribute('aria-current', 'page');
    expect(requested).toEqual([]);

    await page.getByRole('button', { name: 'Load performance' }).click();
    await expect(table(page).locator('tbody tr')).toHaveCount(6);
    expect(requested.map((item) => item.symbol).sort()).toEqual(
      ['AAPL', 'AMZN', 'GOOGL', 'MSFT', 'NVDA', 'SPY'].sort(),
    );
    const days =
      (Date.now() - Date.parse(`${requested[0]!.from}T00:00:00Z`)) / 86_400_000;
    expect(days).toBeGreaterThan(395);
    expect(days).toBeLessThan(405);
    // Best first, then the index row.
    const firstCells = await table(page).locator('tbody th').allInnerTexts();
    expect(firstCells.map((text) => text.trim())).toEqual([
      'NVDA',
      'MSFT',
      'AAPL',
      'AMZN',
      'GOOGL',
      'S&P 500 (SPY)',
    ]);
    await expect(lines(page)).toHaveCount(6);
    await expect(
      page
        .getByTestId('performance-chart')
        .locator('polyline[stroke-dasharray]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('performance-card')).toContainText(
      'Prepared by FlipChart',
    );

    // Periods are cut from the loaded history: nothing is fetched again.
    for (const period of ['1 month', '6 months', '1 year', '3 months']) {
      await page.getByRole('button', { name: period, exact: true }).click();
      await expect(page.getByTestId('performance-card')).toContainText(
        `% change over ${period}`,
      );
    }
    expect(requested).toHaveLength(6);

    // Hovering reads every line at one date, best first.
    const chart = page.getByTestId('performance-chart');
    await chart.locator('.performance-hit').hover();
    const tooltip = page.locator('.performance-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator('span')).toHaveCount(6);
    await expect(tooltip.locator('span').first()).toContainText('NVDA');
    // The keyboard steps through dates too.
    await page.locator('.performance-chart-host').focus();
    const before = await tooltip.locator('strong').innerText();
    await page.keyboard.press('Home');
    await expect(tooltip.locator('strong')).not.toHaveText(before);
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);

    // Hovering a table row brings its line forward and fades the rest.
    await table(page).locator('tbody tr').first().hover();
    const groups = chart.locator('g.performance-line');
    await expect(groups.nth(0)).toHaveAttribute('opacity', '1');
    await expect(groups.nth(1)).toHaveAttribute('opacity', '0.2');

    // Hiding the index removes its line and the comparison column.
    await page.getByLabel('Show index (SPY)').uncheck();
    await expect(lines(page)).toHaveCount(5);
    await expect(table(page).locator('tbody tr')).toHaveCount(5);
    await expect(
      table(page).locator('tbody tr').first().locator('td').nth(1),
    ).toHaveText('–');
    expect(requested).toHaveLength(6);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/comparison-${width}.png`,
      fullPage: true,
    });
    expect(await violations()).toEqual([]);
  });

test('copies the branded comparison as PNG and downloads JPG and CSV', async ({
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
  await page.goto('/#performance');
  await page.getByRole('button', { name: 'Load performance' }).click();
  await expect(table(page).locator('tbody tr')).toHaveCount(6);

  await page.getByRole('button', { name: 'Copy image' }).click();
  await expect(page.getByText(/Chart image copied/)).toBeVisible();
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType('image/png');
    const bitmap = await createImageBitmap(blob);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      width: bitmap.width,
      height: bitmap.height,
      png: Array.from(bytes.slice(0, 8)),
      data: btoa(
        Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''),
      ),
    };
  });
  expect(copied.png).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(copied.width).toBeGreaterThan(1500);
  expect(copied.height).toBeGreaterThan(1000);
  writeFileSync(
    'verification/screenshots/comparison-copied.png',
    Buffer.from(copied.data, 'base64'),
  );

  const jpg = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JPG' }).click();
  const jpgFile = await jpg;
  expect(jpgFile.suggestedFilename()).toMatch(
    /^flipchart-performance-3m-\d{4}-\d{2}-\d{2}\.jpg$/,
  );
  expect([...readFileSync((await jpgFile.path())!).subarray(0, 3)]).toEqual([
    0xff, 0xd8, 0xff,
  ]);

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csv = readFileSync((await (await csvDownload).path())!, 'utf8')
    .trim()
    .split('\r\n');
  expect(csv[0]).toBe(
    'date,NVDA change_pct,MSFT change_pct,AAPL change_pct,AMZN change_pct,GOOGL change_pct,SPY (index) change_pct',
  );
  // The first row is the period start, where every line is 0.
  expect(csv[1]!.split(',').slice(1).map(Number)).toEqual([0, 0, 0, 0, 0, 0]);
});

test('a failed stock or index is named, and the rest still compare', async ({
  page,
}) => {
  await mockRelay(page, ['AAPL', 'SPY']);
  await page.goto('/#performance');
  await page.getByRole('button', { name: 'Load performance' }).click();
  await expect(table(page).locator('tbody tr')).toHaveCount(4);
  await expect(
    page.getByText(/Not loaded and excluded: AAPL, SPY/),
  ).toBeVisible();
  await expect(lines(page)).toHaveCount(4);
  await expect(page.getByTestId('performance-card')).not.toContainText(
    'dashed line',
  );

  await page.getByLabel('Tickers').fill('AAPL, ../etc');
  await page.getByRole('button', { name: 'Load performance' }).click();
  await expect(page.getByRole('alert')).toContainText('Not a valid');
});
