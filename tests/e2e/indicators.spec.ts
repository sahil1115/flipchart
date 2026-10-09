import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

async function importBars(
  page: Page,
  count: number,
  volume: string = '100',
  incomplete = false,
) {
  const rows = Array.from(
    { length: count },
    (_, i) =>
      `${new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10)},10,10,10,10,${volume}`,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'indicator-input.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,open,high,low,close,volume\n' + rows.join('\n')),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('CALC');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('UTC');
  if (incomplete)
    await page.getByLabel('Last daily candle is incomplete').check();
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  // The upload button's former position can become a chart point after load.
  // Read latest-valid legends with the pointer outside the chart.
  await page.mouse.move(0, 0);
}
for (const width of [375, 768, 1440])
  test(`core indicators and editing remain usable at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [],
      external: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173'))
        external.push(request.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    const card = page.getByRole('article', { name: 'RSI 14', exact: true });
    await expect(card).toContainText('Latest valid');
    const latest = await card.locator('strong').textContent();
    await chart.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const count = await chart.locator('canvas').count();
    await page.getByRole('button', { name: '1M', exact: true }).click();
    await expect(card.locator('strong')).toHaveText(latest!);
    await page.getByRole('checkbox', { name: 'OBV', exact: true }).check();
    await expect(
      page.getByRole('article', { name: 'OBV', exact: true }),
    ).toContainText('Latest valid');
    await expect(chart.locator('canvas')).toHaveCount(count + 4);
    await page.getByRole('checkbox', { name: 'OBV', exact: true }).uncheck();
    await expect(chart.locator('canvas')).toHaveCount(count);
    await page.getByRole('checkbox', { name: 'EMA', exact: true }).check();
    await page
      .getByRole('checkbox', { name: 'Bollinger Bands', exact: true })
      .check();
    await page.getByText('Calculation parameters', { exact: true }).click();
    await page.getByLabel('RSI period', { exact: true }).fill('7');
    await page
      .getByRole('button', { name: 'Apply parameters', exact: true })
      .click();
    const changed = page.getByRole('article', { name: 'RSI 7', exact: true });
    await expect(changed).toContainText('Latest valid');
    expect(await changed.locator('strong').textContent()).not.toBe(latest);
    await page.getByLabel('MACD fast period', { exact: true }).fill('26');
    await page
      .getByRole('button', { name: 'Apply parameters', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Last valid calculations remain',
    );
    await expect(changed).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Reset calculation parameters',
        exact: true,
      })
      .click();
    await expect(card.locator('strong')).toHaveText(latest!);
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByLabel('Reduce visual effects').check();
    await expect(chart.locator('canvas')).toHaveCount(count);
    await chart.scrollIntoViewIfNeeded();
    const bounds = await chart.boundingBox();
    if (bounds) {
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
      await expect(page.locator('.chart-legend')).toContainText('Cursor');
      await expect(card).toContainText('Cursor');
      // The same crosshair time updates the price and every indicator legend.
      const priceDate = (await page
        .locator('.chart-legend')
        .textContent())!.match(/\d{4}-\d{2}-\d{2}/)![0];
      await expect(card).toContainText(priceDate);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + 25, bounds.y + 100, {
        steps: 5,
      });
      await page.mouse.up();
      await page.mouse.wheel(0, -120);
    }
    await page.getByRole('button', { name: /Reset view/ }).click();
    await page.mouse.move(0, 0);
    await expect(card).toContainText('Latest valid');
    await expect
      .poll(() =>
        chart.evaluate((element) => {
          const rows = Array.from(element.querySelectorAll('tr')).filter(
            (row) => row.querySelector('canvas'),
          );
          const heights = rows
            .slice(0, -1)
            .map((row) => row.getBoundingClientRect().height);
          return (
            heights.length === 5 &&
            heights[0]! >= 300 &&
            heights.slice(1).every((height) => height >= 90)
          );
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/indicators-${width}.png`,
      fullPage: true,
    });
    await chart.screenshot({
      path: `verification/screenshots/indicator-chart-${width}.png`,
    });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
test('short history, missing volume, finalized date and real zero values are explicit', async ({
  page,
}) => {
  await importBars(page, 40, '', true);
  const rsi = page.getByRole('article', { name: 'RSI 14', exact: true });
  await expect(rsi.locator('strong')).toHaveText('0');
  await expect(rsi).toContainText('2000-02-08');
  await expect(rsi).toContainText('earlier than latest candle');
  await expect(
    page
      .getByRole('article', { name: 'ATR 14', exact: true })
      .locator('strong'),
  ).toHaveText('0');
  await expect(
    page.getByRole('article', { name: 'Volume SMA 20', exact: true }),
  ).toContainText('Unavailable');
  await page.getByRole('checkbox', { name: 'OBV', exact: true }).check();
  await expect(
    page.getByRole('article', { name: 'OBV', exact: true }),
  ).toContainText('Unknown volume');
  await expect(
    page.getByRole('article', { name: 'SMA', exact: true }),
  ).toContainText('Needs 200 finalized bars');
  await expect(
    page
      .getByRole('article', { name: 'MACD 12, 26, 9', exact: true })
      .getByText('0', { exact: true }),
  ).toHaveCount(3);
});
test('5,000 finalized candles support indicators, parameter edits, pan/zoom and reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const begin = Date.now();
  await importBars(page, 5000, '0');
  const loaded = Date.now();
  await expect(
    page.getByRole('article', { name: 'SMA', exact: true }),
  ).not.toContainText('Unavailable');
  await page.getByRole('checkbox', { name: 'OBV', exact: true }).check();
  await expect(
    page.getByRole('article', { name: 'OBV', exact: true }).locator('strong'),
  ).toHaveText('0');
  await page.getByText('Calculation parameters', { exact: true }).click();
  await page.getByLabel('RSI period', { exact: true }).fill('7');
  const editStart = Date.now();
  await page
    .getByRole('button', { name: 'Apply parameters', exact: true })
    .click();
  await expect(
    page.getByRole('article', { name: 'RSI 7', exact: true }).locator('strong'),
  ).toHaveText('0');
  const edited = Date.now();
  const chart = page.getByTestId('price-chart');
  await chart.scrollIntoViewIfNeeded();
  const bounds = await chart.boundingBox();
  if (bounds) {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + 100, {
      steps: 5,
    });
    await page.mouse.up();
    await page.mouse.wheel(0, -200);
  }
  await page.getByRole('button', { name: /Reset view/ }).click();
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'RSI 7', exact: true }).locator('strong'),
  ).toHaveText('0');
  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('5,000 bars');
  expect(errors).toEqual([]);
  const measurements = {
    environment: `Automated ${testInfo.project.name} on Windows; elapsed workflow timings include browser/test overhead`,
    uploadToLoadedMs: loaded - begin,
    parameterApplyToVisibleMs: edited - editStart,
    candles: 5000,
  };
  writeFileSync(
    testInfo.outputPath('indicator-timings.json'),
    JSON.stringify(measurements, null, 2),
  );
  console.log('Phase 3 observations:', measurements);
});
