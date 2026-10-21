import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
test.use({ serviceWorkers: 'block' });

/**
 * Deterministic Yahoo-shaped history. Benchmarks are flat; XLK and ITBEES
 * accelerate (Leading), XLU and METALIETF decay faster and faster (Lagging);
 * everything else drifts slightly.
 */
function price(symbol: string, step: number) {
  const base = symbol.replace('.NS', '');
  if (base === 'XLK' || base === 'ITBEES')
    return 100 * Math.exp(step * step * 0.00002);
  if (base === 'XLU' || base === 'METALIETF')
    return 100 * Math.exp(-step * step * 0.00002);
  if (base === 'SPY' || base === 'NIFTYBEES') return 100;
  const seed = [...base].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 100 + Math.sin(step / 9 + seed) * 3;
}
function history(symbol: string, from: string, to: string) {
  const india = symbol.endsWith('.NS');
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
        india ? 4 : 14,
        30,
      ) / 1000,
    );
    close.push(Number(price(symbol, step).toFixed(4)));
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
            instrumentType: india ? 'EQUITY' : 'ETF',
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
const table = (page: Page) => page.getByTestId('rotation-table');
const row = (page: Page, ticker: string) =>
  table(page).locator('tbody tr', { hasText: ticker });

for (const width of [375, 1440])
  test(`sector rotation loads US and India weekly readings at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const violations = await trackViolations(page);
    const requested = await mockRelay(page);
    await page.goto('/');
    const tab = page.getByRole('link', { name: 'Sector rotation' });
    await tab.click();
    await expect(page).toHaveURL(/#rotation$/);
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('heading', { name: 'Sector rotation' }),
    ).toBeVisible();
    expect(requested).toEqual([]);

    await page.getByRole('button', { name: 'Load rotation' }).click();
    await expect(table(page).locator('tbody tr')).toHaveCount(11);
    expect(requested.map((item) => item.symbol).sort()).toEqual(
      [
        'SPY',
        ...['XLK', 'XLC', 'XLY', 'XLP', 'XLE', 'XLF', 'XLV', 'XLI', 'XLB'],
        'XLRE',
        'XLU',
      ].sort(),
    );
    // About 44 weeks of history are requested, not the heatmap's 75 days.
    const days =
      (Date.now() - Date.parse(`${requested[0]!.from}T00:00:00Z`)) / 86_400_000;
    expect(days).toBeGreaterThan(305);
    expect(days).toBeLessThan(315);
    await expect(row(page, 'XLK')).toContainText('Leading');
    await expect(row(page, 'XLU')).toContainText('Lagging');
    await expect(page.locator('.rotation-dot')).toHaveCount(11);
    await expect(page.getByTestId('rotation-card')).toContainText(
      'Prepared by FlipChart',
    );
    await expect(page.getByTestId('rotation-card')).toContainText(
      'Data: Yahoo Finance (unofficial)',
    );
    await expect(
      page.getByRole('status').filter({ hasText: /^Showing 11 sectors/ }),
    ).toBeVisible();

    await page.getByLabel('Market', { exact: true }).selectOption('india');
    await page.getByRole('button', { name: 'Load rotation' }).click();
    await expect(table(page).locator('tbody tr')).toHaveCount(10);
    await expect(row(page, 'ITBEES')).toContainText('Leading');
    await expect(row(page, 'METALIETF')).toContainText('Lagging');
    const india = requested.filter((item) => item.symbol.endsWith('.NS'));
    expect(india.map((item) => item.symbol)).toContain('NIFTYBEES.NS');
    expect(india).toHaveLength(11);
    await expect(page.getByTestId('rotation-card')).toContainText(
      'India sectors vs Nifty 50',
    );
    await expect(page.locator('.rotation-dot')).toHaveCount(10);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/rotation-${width}.png`,
      fullPage: true,
    });
    expect(await violations()).toEqual([]);

    await page.getByRole('button', { name: 'Back to chart' }).click();
    await expect(
      page.getByRole('link', { name: 'Chart', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('rotation-card')).toHaveCount(0);
  });

test('copies the branded rotation chart as PNG and downloads JPG and CSV', async ({
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
  await page.goto('/#rotation');
  await page.getByRole('button', { name: 'Load rotation' }).click();
  await expect(table(page).locator('tbody tr')).toHaveCount(11);

  await page.getByRole('button', { name: 'Copy image' }).click();
  await expect(page.getByText(/Chart image copied/)).toBeVisible();
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
  expect(copied.width).toBeGreaterThan(1500);
  expect(copied.height).toBeGreaterThan(1000);
  writeFileSync(
    'verification/screenshots/rotation-copied.png',
    Buffer.from(copied.data, 'base64'),
  );

  const jpgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JPG' }).click();
  const jpgFile = await jpgDownload;
  expect(jpgFile.suggestedFilename()).toMatch(
    /^flipchart-sector-rotation-sp-\d{4}-\d{2}-\d{2}\.jpg$/,
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
    'sector,ticker,week_ending,rs_ratio,rs_momentum,quadrant',
  );
  // Six weekly readings for each of the eleven sectors.
  expect(csv).toHaveLength(1 + 11 * 6);
  expect(csv.find((line) => line.startsWith('Technology,XLK,'))).toMatch(
    /,Leading$/,
  );
});

test('failed sectors are named, and a missing benchmark stops with a clear message', async ({
  page,
}) => {
  await mockRelay(page, ['XLE']);
  await page.goto('/#rotation');
  await page.getByRole('button', { name: 'Load rotation' }).click();
  await expect(table(page).locator('tbody tr')).toHaveCount(10);
  await expect(page.getByText(/Not loaded and excluded: XLE/)).toBeVisible();
  await expect(row(page, 'XLE')).toHaveCount(0);

  await page.unrouteAll();
  await mockRelay(page, ['SPY']);
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await page.getByRole('link', { name: 'Sector rotation' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load rotation' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'S&P 500 (SPY) did not load',
  );
  await expect(page.getByTestId('rotation-card')).toHaveCount(0);
});
