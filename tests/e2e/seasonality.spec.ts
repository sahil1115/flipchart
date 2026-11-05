import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
test.use({ serviceWorkers: 'block' });

/**
 * Daily weekday candles whose close is constant inside a month, so each
 * month's return is known exactly: +1% every month except December (−10%).
 */
function monthlyCsv(first: string, last: string) {
  const rows = ['date,open,high,low,close,volume'];
  let level = 100;
  let previous = '';
  for (
    const day = new Date(`${first}T00:00:00Z`);
    day <= new Date(`${last}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if ([0, 6].includes(day.getUTCDay())) continue;
    const date = day.toISOString().slice(0, 10);
    const month = date.slice(0, 7);
    if (previous && month !== previous)
      level *= month.endsWith('-12') ? 0.9 : 1.01;
    previous = month;
    rows.push(
      `${date},${level},${level + 1},${level - 1},${level.toFixed(6)},1000`,
    );
  }
  return rows.join('\n');
}

async function importCsv(page: Page, csv: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'monthly.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('SEASON');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('UTC');
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
}

const table = (page: Page) => page.getByTestId('seasonality-table');
const bodyRow = (page: Page, year: number) =>
  table(page).locator('tbody:not(.seasonality-stats) tr', {
    has: page.getByRole('rowheader', { name: String(year), exact: true }),
  });
const statRow = (page: Page, name: string) =>
  table(page).locator('.seasonality-stats tr', {
    has: page.getByRole('rowheader', { name, exact: true }),
  });
const texts = (row: ReturnType<typeof bodyRow>) =>
  row.locator('td').allInnerTexts();

test('shows each month as a coloured percentage with averages and up-month shares', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await importCsv(page, monthlyCsv('2021-11-01', '2024-12-31'));
  await expect(
    page.getByRole('heading', { name: 'Monthly returns', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('seasonality-card')).toContainText(
    'SEASON · Monthly returns',
  );
  await expect(page.getByTestId('seasonality-card')).toContainText(
    'Prepared by FlipChart',
  );
  await expect(page.getByTestId('seasonality-card')).toContainText(
    'Data: Imported CSV',
  );

  // Newest year first.
  const years = await table(page)
    .locator('tbody:not(.seasonality-stats) tr th')
    .allInnerTexts();
  expect(years).toEqual(['2024', '2023', '2022', '2021']);
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

  // 2023: every month +1.0% except December −10.0%. The year is
  // 1.01^11 × 0.9 − 1 against the 2022 year-end close.
  const year2023 = 100 * (1.01 ** 11 * 0.9 - 1);
  expect(await texts(bodyRow(page, 2023))).toEqual([
    ...Array(11).fill('+1.0'),
    '−10.0',
    `${year2023 >= 0 ? '+' : '−'}${Math.abs(year2023).toFixed(1)}`,
  ]);
  // 2021 starts in November: its first month and its year change are unknown.
  expect(await texts(bodyRow(page, 2021))).toEqual([
    ...Array(10).fill('–'),
    '–',
    '−10.0',
    '–',
  ]);
  // 2024 follows a December, so January is +1.0%.
  expect((await texts(bodyRow(page, 2024)))[0]).toBe('+1.0');

  // December closed down 10% in all four years: an average and a 0% up share.
  expect((await texts(statRow(page, 'Average')))[11]).toBe('−10.0');
  expect((await texts(statRow(page, 'Up months')))[11]).toBe('0%');
  // January closed up 1% in three years, as did every other month but December.
  expect((await texts(statRow(page, 'Average')))[0]).toBe('+1.0');
  expect((await texts(statRow(page, 'Up months')))[0]).toBe('100%');
  // November 2021 is the first month of the data, so only three Novembers count.
  await expect(statRow(page, 'Average').locator('td').nth(10)).toHaveAttribute(
    'title',
    /average of 3 complete months/,
  );

  // Values are never colour alone: each cell names its month and exact value.
  await expect(bodyRow(page, 2023).locator('td').nth(11)).toHaveAttribute(
    'title',
    'Dec 2023: -10.00%',
  );
  await expect(table(page).locator('td.in-progress')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByTestId('seasonality-card').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'verification/screenshots/seasonality-1440.png',
    fullPage: true,
  });
});

test('uses the heatmap colour setting and stays inside a phone screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await importCsv(page, monthlyCsv('2022-11-01', '2024-12-31'));
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

  // With only two Januaries in the data there is no average to show yet.
  expect((await texts(statRow(page, 'Average')))[0]).toBe('–');
  expect((await texts(statRow(page, 'Up months')))[0]).toBe('–');
  // The wide table scrolls inside its card rather than the page.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByTestId('seasonality-card').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'verification/screenshots/seasonality-375.png',
    fullPage: true,
  });
});

test('marks a month still in progress and leaves it out of the statistics', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const today = new Date();
  const start = new Date(
    Date.UTC(today.getUTCFullYear() - 3, today.getUTCMonth(), 1),
  );
  await importCsv(
    page,
    monthlyCsv(
      start.toISOString().slice(0, 10),
      today.toISOString().slice(0, 10),
    ),
  );
  // The latest weekday is in the current month except on the 1st or 2nd of a month.
  const lastWeekday = new Date(today);
  while ([0, 6].includes(lastWeekday.getUTCDay()))
    lastWeekday.setUTCDate(lastWeekday.getUTCDate() - 1);
  const inProgress =
    lastWeekday.getUTCMonth() === today.getUTCMonth() &&
    lastWeekday.getUTCFullYear() === today.getUTCFullYear();
  // A year that ends before December, or holds a month in progress, is a year to date.
  const yearToDate = lastWeekday.getUTCMonth() < 11 || inProgress;
  await expect(table(page).locator('td.in-progress')).toHaveCount(
    Number(inProgress) + Number(yearToDate),
  );
  if (inProgress)
    await expect(page.getByTestId('seasonality-card')).toContainText(
      'Dashed outline: month still in progress',
    );
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
  await importCsv(page, monthlyCsv('2022-11-01', '2024-12-31'));

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
  expect(jpgFile.suggestedFilename()).toBe(
    'flipchart-SEASON-monthly-returns-2024-12-31.jpg',
  );
  expect([...readFileSync((await jpgFile.path())!).subarray(0, 3)]).toEqual([
    0xff, 0xd8, 0xff,
  ]);

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download monthly CSV' }).click();
  const csvFile = await csvDownload;
  expect(csvFile.suggestedFilename()).toBe(
    'flipchart-SEASON-monthly-returns-2024-12-31.csv',
  );
  const csv = readFileSync((await csvFile.path())!, 'utf8')
    .trim()
    .split('\r\n');
  expect(csv[0]).toBe(
    'Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,Year change %,Note',
  );
  // Newest year first, three years, then the two statistic rows.
  expect(csv.map((line) => line.split(',')[0])).toEqual([
    'Year',
    '2024',
    '2023',
    '2022',
    'Average',
    'Up months %',
  ]);
  const cells = csv[2]!.split(',');
  expect(cells.slice(1, 12).every((value) => Number(value) > 0.99)).toBe(true);
  expect(Number(cells[12])).toBeCloseTo(-10, 3);
  expect(Number(cells[13])).toBeCloseTo(100 * (1.01 ** 11 * 0.9 - 1), 3);
  // January 2022 does not exist in the data, so its cell is empty.
  expect(csv[3]!.split(',').slice(1, 3)).toEqual(['', '']);
  const average = csv[4]!.split(',');
  expect(Number(average[12])).toBeCloseTo(-10, 3);
  expect(average[1]).toBe('');
});

test('the demo shows its three years and ignores the chart interval', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Monthly returns', exact: true }),
  ).toBeVisible();
  await expect(
    table(page).locator('tbody:not(.seasonality-stats) tr'),
  ).toHaveCount(3);
  // Changing the chart interval does not change the calendar-month figures.
  const before = await table(page).innerText();
  await page.getByRole('button', { name: 'Weekly interval' }).click();
  expect(await table(page).innerText()).toBe(before);
});
