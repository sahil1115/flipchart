import { expect, test } from '@playwright/test';
import { yahooHistory } from '../fixtures/yahoo-finance';
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
    await page.goto('/');
    await page.getByRole('button', { name: /Connect Provider/ }).click();
    await page.getByRole('radio', { name: 'Yahoo · NSE' }).check();
    const panel = page.getByRole('dialog', { name: 'Data source' });
    await expect(panel.getByText(/no API key/i)).toBeVisible();
    await expect(panel.getByLabel('Yahoo Finance API key')).toHaveCount(0);
    await page
      .getByLabel('NSE trading symbol', { exact: true })
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
    await page.getByRole('radio', { name: 'Yahoo · NSE' }).check();
    await expect(
      page.getByRole('button', {
        name: 'Select saved FIXTURE.NS · NSE',
        exact: true,
      }),
    ).toBeVisible();
  });
}
