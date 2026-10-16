import { expect, test } from '@playwright/test';
for (const width of [375, 1440]) {
  test(`terminal dark/white and seven accents preserve charts at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith(test.info().project.use.baseURL!))
        external.push(request.url());
    });
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    await page.mouse.move(0, 0);
    const latest = await page.locator('.summary-price > strong').textContent();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: 'Terminal', exact: true }).check();
    for (const [name, background] of [
      ['Dark', 'rgb(0, 0, 0)'],
      ['White', 'rgb(255, 255, 255)'],
    ]) {
      await page.getByRole('radio', { name, exact: true }).check();
      for (const color of [
        'Solar Yellow',
        'Heritage Gold',
        'Electric Blue',
        'Emerald Green',
        'Rose Pink',
        'Royal Purple',
        'Pure Contrast',
      ]) {
        await page
          .getByRole('radio', { name: `${color} accent`, exact: true })
          .check();
        await expect(
          page.getByRole('radio', { name: `${color} accent`, exact: true }),
        ).toBeChecked();
        await expect(chart).toHaveCSS('background-color', background!);
        if (color === 'Pure Contrast') {
          await expect(page.locator('html')).toHaveCSS(
            'color',
            name === 'Dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)',
          );
        }
        await expect(page.locator('.readout-rail')).toHaveCSS(
          'background-color',
          background!,
        );
        await expect(page.locator('.app-header')).toHaveCSS(
          'background-color',
          background!,
        );
        await expect(page.locator('.summary-price > strong')).toHaveText(
          latest!,
        );
        await expect(chart.locator('canvas').first()).toBeVisible();
        await expect(
          page.getByTestId('indicator-chart').locator('canvas').first(),
        ).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `verification/screenshots/terminal-${name!.toLowerCase()}-${width}.png`,
      });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    }
    await page.reload();
    await expect(chart).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('html')).toHaveCSS('font-family', /Consolas/);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'White', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Pure Contrast accent', exact: true }),
    ).toBeChecked();
    await page.getByRole('radio', { name: 'Ocean Blue', exact: true }).check();
    await expect(page.locator('html')).not.toHaveCSS('font-family', /Consolas/);
    await page.getByRole('radio', { name: 'Terminal', exact: true }).check();
    await expect(
      page.getByRole('radio', { name: 'White', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Pure Contrast accent', exact: true }),
    ).toBeChecked();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByLabel('Font style', { exact: true })
      .selectOption('verdana');
    await expect(page.locator('html')).toHaveCSS('font-family', /Verdana/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    await expect(page.locator('.dock-card:not(.expanded)')).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
