import { expect, test } from '@playwright/test';
import {
  yahooHistory,
  yahooSearch,
  yahooUsHistory,
} from '../fixtures/yahoo-finance';
test.use({ serviceWorkers: 'block' });

for (const width of [375, 1440]) {
  test(`Yahoo NSE loads manually without a key and retains charts on failures at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let calls = 0;
    let failure = false;
    await page.route('**/api/yahoo/history?*', async (route) => {
      calls++;
      await route.fulfill({
        status: failure ? 429 : 200,
        json: failure
          ? { error: { category: 'quota-exhausted' } }
          : yahooHistory(),
      });
    });
    await page.route('**/api/yahoo/search?*', (route) =>
      route.fulfill({
        json: yahooSearch({
          symbol: 'FIXTURE.NS',
          exchange: 'NSI',
          name: 'Fictional NSE Company',
        }),
      }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: /Connect Provider/ }).click();
    await page.getByRole('radio', { name: 'Yahoo Finance' }).check();
    const panel = page.getByRole('dialog', { name: 'Data source' });
    await expect(panel.getByText(/no API key/i)).toBeVisible();
    await expect(panel.getByLabel('Yahoo Finance API key')).toHaveCount(0);
    await page
      .getByLabel('Search symbol or company', { exact: true })
      .fill('fixture');
    await panel.getByRole('button', { name: /^FIXTURE.NS · NSE/ }).click();
    expect(calls).toBe(0);
    await panel
      .getByRole('button', { name: 'Load history', exact: true })
      .click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    await expect(chart).toHaveAttribute('aria-label', /Yahoo Finance provider/);
    await expect(page.locator('.chart-footnote')).toContainText(
      'Yahoo Finance',
    );
    await expect(page.locator('.dataset-note')).toContainText(
      'Data provided by Yahoo Finance',
    );
    await expect(page.locator('.dataset-note')).not.toContainText(
      'Twelve Data',
    );
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('FIXTURE.NS');
    await expect(page.locator('.source-note')).toContainText('Yahoo Finance');
    await expect(page.locator('.source-note')).toContainText(
      'Adjustment: unknown',
    );
    expect(calls).toBe(1);
    // A successful load closes the drawer; reopen it from the header pill.
    await page.getByRole('button', { name: /^Data source/ }).click();
    await page.getByLabel('History window', { exact: true }).selectOption('3Y');
    expect(calls).toBe(1);
    await panel
      .getByRole('button', { name: 'Save FIXTURE.NS · NSE', exact: true })
      .click();
    failure = true;
    await panel
      .getByRole('button', { name: 'Refresh loaded data', exact: true })
      .click();
    await expect(panel.getByRole('alert')).toContainText('limiting requests');
    await expect(chart.locator('canvas').first()).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('FIXTURE.NS');
    expect(calls).toBe(2);
    await expect(page.locator('.footer-disclaimer')).toContainText(
      'Independently verify prices and results',
    );
    await expect(page.locator('.footer-disclaimer')).toContainText(
      'accept no responsibility for losses',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/yahoo-nse-${width}.png`,
      fullPage: true,
    });
    await page.reload();
    expect(calls).toBe(2);
    await page.getByRole('button', { name: /Connect Provider/ }).click();
    await page.getByRole('radio', { name: 'Yahoo Finance' }).check();
    await expect(
      page.getByRole('button', {
        name: 'Select saved FIXTURE.NS · NSE',
        exact: true,
      }),
    ).toBeVisible();
  });
}

test('Yahoo finds US stocks by company name or ticker after choosing the country', async ({
  page,
}) => {
  const searches: string[] = [];
  const histories: string[] = [];
  await page.route('**/api/yahoo/search?*', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    searches.push(q);
    return route.fulfill({
      json: yahooSearch(
        { symbol: 'AAPL', exchange: 'NMS', name: 'Apple Inc.' },
        { symbol: 'KO', exchange: 'NYQ', name: 'The Coca-Cola Company' },
        {
          symbol: 'RELIANCE.NS',
          exchange: 'NSI',
          name: 'Reliance Industries Limited',
        },
      ),
    });
  });
  await page.route('**/api/yahoo/history?*', (route) => {
    histories.push(new URL(route.request().url()).searchParams.get('symbol')!);
    return route.fulfill({ json: yahooUsHistory('AAPL') });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Connect Provider/ }).click();
  await page.getByRole('radio', { name: 'Yahoo Finance' }).check();
  const panel = page.getByRole('dialog', { name: 'Data source' });
  const country = panel.getByLabel('Country');
  await expect(country).toHaveValue('india');
  await country.selectOption('us');
  const search = panel.getByLabel('Search symbol or company', { exact: true });
  await expect(search).toHaveAttribute('placeholder', /Apple or AAPL/);
  await search.fill('apple');
  // Only US stocks are listed; the NSE match for the same search is hidden.
  const apple = panel.getByRole('button', { name: /^AAPL · NASDAQ/ });
  await expect(apple).toBeVisible();
  await expect(panel.getByRole('button', { name: /^KO · NYSE/ })).toBeVisible();
  await expect(panel.getByText('RELIANCE.NS')).toHaveCount(0);
  expect(searches).toContain('apple');
  // Switching country searches the same text again within the new market.
  await country.selectOption('india');
  await expect(
    panel.getByRole('button', { name: /^RELIANCE.NS · NSE/ }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: /^AAPL/ })).toHaveCount(0);
  await country.selectOption('us');
  await apple.click();
  expect(histories).toEqual([]);
  await panel
    .getByRole('button', { name: 'Load history', exact: true })
    .click();
  await expect(panel).toBeHidden();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  expect(histories).toEqual(['AAPL']);
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('AAPL');
  await expect(
    page.getByRole('button', { name: /^Data source/ }),
  ).toHaveAccessibleName('Data source: Yahoo Finance · AAPL');
});
