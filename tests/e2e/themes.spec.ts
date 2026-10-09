import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  test(`themes preserve charts and fit at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    const canvases = await chart.locator('canvas').count();
    await page.getByRole('button', { name: /Settings/ }).click();
    for (const [name, id, background] of [
      ['Soft Clay', 'soft-clay', 'rgb(228, 231, 235)'],
      ['Midnight Clay', 'midnight-clay', 'rgb(35, 44, 58)'],
    ]) {
      await page.getByRole('radio', { name, exact: true }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', id!);
      await expect(chart).toHaveCSS('background-color', background!);
      await expect(chart.locator('canvas')).toHaveCount(canvases);
      await expect(
        page.getByRole('region', { name: 'Dataset summary' }),
      ).toContainText('FLIP');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByLabel('Reduce visual effects').check();
      await expect(page.locator('.chart-panel')).toHaveCSS(
        'box-shadow',
        'none',
      );
      await expect(
        page.getByRole('button', { name: '6M', exact: true }),
      ).toHaveCSS('box-shadow', 'none');
      await page.getByLabel('Reduce visual effects').uncheck();
      await page.screenshot({
        path: `verification/screenshots/${id}-${width}.png`,
        fullPage: true,
      });
      if (width === 1440) {
        await page.locator('#appearance-settings').screenshot({
          path: `verification/screenshots/${id}-settings.png`,
        });
      }
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      'midnight-clay',
    );
    await expect(chart.locator('canvas').first()).toBeVisible();
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByRole('radio', { name: 'Glass Light' }).check();
    await expect(chart).toHaveCSS('background-color', 'rgb(252, 253, 255)');
    await expect(page.locator('.theme-option').first()).toHaveCSS(
      'box-shadow',
      'none',
    );
    await page.getByRole('radio', { name: 'Glass Light' }).press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: 'Soft Clay', exact: true }),
    ).toBeChecked();
    expect(errors).toEqual([]);
  });
}
