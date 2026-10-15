import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** About 245 sessions a year: weekdays with every 16th one a holiday, as on NSE. */
function nseLikeRows(years: number) {
  const rows: string[] = [];
  const date = new Date(Date.UTC(2022, 0, 3));
  let weekday = 0;
  while (rows.length < years * 245) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      weekday++;
      if (weekday % 16 !== 0) {
        const i = rows.length;
        const base = 100 + 10 * Math.sin(i / 9) + i * 0.05;
        const close = base + 0.4 * Math.sin(i * 1.7);
        rows.push(
          `${date.toISOString().slice(0, 10)},${base},${base + 2},${base - 2},${close},${1000 + (i % 7)}`,
        );
      }
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return rows;
}

async function importHolidayHistory(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'nse-like.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'date,open,high,low,close,volume\n' + nseLikeRows(5).join('\n'),
    ),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('NSELIKE');
  await page.getByLabel('Currency', { exact: true }).fill('INR');
  await page
    .getByLabel('Exchange timezone', { exact: true })
    .fill('Asia/Kolkata');
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  await page.mouse.move(0, 0);
}

test('52-week range is available for a calendar with fewer than 252 sessions a year', async ({
  page,
}) => {
  await importHolidayHistory(page);
  const coverage = page.getByRole('region', { name: 'Daily coverage metrics' });
  await expect(coverage).toContainText('Finalized daily source');
  await expect(coverage).not.toContainText('Needs 52 weeks');
});

for (const [interval, label] of [
  ['Weekly', 'weekly'],
  ['Monthly', 'monthly'],
] as const)
  test(`${label} view keeps holiday-gapped periods complete and computes indicators`, async ({
    page,
  }) => {
    await importHolidayHistory(page);
    await page.getByRole('button', { name: `${interval} interval` }).click();
    const notice = page.getByText(/groups have missing weekdays/);
    await expect(notice).toBeVisible();
    // Only the unfilled first/last periods may be excluded, never interior holidays.
    const excluded = Number(
      (await notice.textContent())!.match(/(\d+) provisional/)![1],
    );
    expect(excluded).toBeLessThanOrEqual(2);
    const rsi = page.getByRole('article', { name: 'RSI 14', exact: true });
    await expect(rsi).toContainText('Latest valid');
    await expect(rsi.locator('strong').first()).not.toHaveText('Unavailable');
  });
