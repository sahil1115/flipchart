import { expect, test } from '@playwright/test';
test.use({ serviceWorkers: 'block' });

for (const width of [390, 1440])
  test(`minimal header: tabs, data-source drawer and settings are keyboard friendly at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    // Page tabs mark the current page and switch views.
    const chartTab = page.getByRole('link', { name: 'Chart', exact: true });
    const correlationTab = page.getByRole('link', {
      name: 'Correlation',
      exact: true,
    });
    await expect(chartTab).toHaveAttribute('aria-current', 'page');
    await correlationTab.click();
    await expect(correlationTab).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('heading', { name: 'Correlation heatmap' }),
    ).toBeVisible();
    await chartTab.click();
    await expect(chartTab).toHaveAttribute('aria-current', 'page');

    // The data-source pill opens a labelled dialog below the header.
    const pill = page.getByRole('button', { name: /^Data source/ });
    await expect(pill).toHaveAccessibleName('Data source: Connect data');
    await pill.click();
    const drawer = page.getByRole('dialog', { name: 'Data source' });
    await expect(drawer).toBeVisible();
    await expect(pill).toHaveAttribute('aria-expanded', 'true');
    await expect(
      drawer.getByRole('radio', { name: 'Twelve Data' }),
    ).toBeFocused();
    const headerBottom = await page
      .locator('.app-header')
      .evaluate((header) => header.getBoundingClientRect().bottom);
    const drawerTop = (await drawer.boundingBox())!.y;
    expect(Math.abs(drawerTop - headerBottom)).toBeLessThan(2);

    // Tab stays inside the dialog; Escape closes it and returns focus.
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    expect(
      await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(pill).toBeFocused();
    await expect(pill).toHaveAttribute('aria-expanded', 'false');

    // Clicking the dimmed page outside the drawer also closes it; on phones
    // the drawer fills the screen, so the close button is used instead.
    await pill.click();
    if (width > 600) await page.mouse.click(10, 300);
    else
      await page
        .getByRole('button', { name: 'Close connection panel' })
        .click();
    await expect(drawer).toBeHidden();

    // Settings: one gear menu; Escape returns focus to the gear.
    const gear = page.getByRole('button', { name: 'Settings', exact: true });
    await gear.click();
    const menu = page.getByRole('region', { name: 'Settings' });
    await expect(
      menu.getByRole('radio', { name: 'Glass Light' }),
    ).toBeFocused();
    await expect(menu.getByLabel('Font style')).toBeVisible();
    await expect(menu.getByLabel('Reduce visual effects')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(gear).toBeFocused();

    // Loaded data is reflected in the pill.
    await page.getByRole('button', { name: /Try Demo/ }).click();
    await expect(pill).toHaveAccessibleName('Data source: Demo · FLIP');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

test('a successful provider load closes the drawer to reveal the chart', async ({
  page,
}) => {
  await page.route('**/api/yahoo/history?*', async (route) => {
    const url = new URL(route.request().url());
    const from = new Date(`${url.searchParams.get('from')}T00:00:00Z`);
    const timestamp: number[] = [];
    const close: number[] = [];
    for (let day = 0; day < 260; day++) {
      const date = new Date(from.getTime() + day * 86_400_000);
      if ([0, 6].includes(date.getUTCDay())) continue;
      timestamp.push(date.getTime() / 1000 + 4 * 3600);
      close.push(100 + Math.sin(day / 9) * 5);
    }
    await route.fulfill({
      json: {
        chart: {
          error: null,
          result: [
            {
              meta: {
                symbol: 'FIXTURE.NS',
                currency: 'INR',
                exchangeName: 'NSI',
                exchangeTimezoneName: 'Asia/Kolkata',
                instrumentType: 'EQUITY',
                dataGranularity: '1d',
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
      },
    });
  });
  await page.goto('/');
  const pill = page.getByRole('button', { name: /^Data source/ });
  await pill.click();
  await page.getByRole('radio', { name: 'Yahoo · NSE' }).check();
  const drawer = page.getByRole('dialog', { name: 'Data source' });
  await drawer.getByLabel('NSE trading symbol').fill('fixture');
  await drawer.getByRole('button', { name: /^FIXTURE.NS · NSE/ }).click();
  await drawer.getByRole('button', { name: 'Load history' }).click();
  await expect(drawer).toBeHidden();
  await expect(pill).toBeFocused();
  await expect(pill).toHaveAccessibleName(
    'Data source: Yahoo Finance · FIXTURE.NS',
  );
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
});
