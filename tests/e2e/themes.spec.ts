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
    // Native indicator panes finish laying out after the first canvas appears.
    await chart.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const canvases = await chart.locator('canvas').count();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    for (const [name, id, background] of [
      ['Soft Clay', 'soft-clay', 'rgb(228, 231, 235)'],
      ['Midnight Clay', 'midnight-clay', 'rgb(35, 44, 58)'],
      ['Ocean Blue', 'ocean-blue', 'rgb(237, 246, 255)'],
      ['Plum Noir', 'plum-noir', 'rgb(34, 28, 45)'],
      ['Terminal', 'terminal-amber', 'rgb(0, 0, 0)'],
      // Frosted Mono stays last: the reload check below expects it restored.
      ['Notebook', 'notebook', 'rgb(255, 254, 249)'],
      ['Frosted Mono', 'frosted-mono', 'rgb(243, 242, 238)'],
    ]) {
      await page.getByRole('radio', { name, exact: true }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', id!);
      await expect(chart).toHaveCSS('background-color', background!);
      await expect(chart.locator('canvas')).toHaveCount(canvases);
      await expect(
        page.getByRole('region', { name: 'Dataset summary' }),
      ).toContainText('FLIP');
      if (id === 'notebook') {
        // The bundled handwriting font loads from this origin under the CSP.
        await expect
          .poll(() =>
            page.evaluate(() => document.fonts.check("16px 'Patrick Hand'")),
          )
          .toBe(true);
        await expect(page.locator('h1')).toHaveCSS(
          'font-family',
          /Patrick Hand/,
        );
      }
      if (id === 'frosted-mono') {
        await expect(page.locator('.summary-price > strong')).toHaveCSS(
          'color',
          'rgb(241, 243, 241)',
        );
        await expect(
          page.locator('.indicator-card').first().locator('h3'),
        ).toHaveCSS('color', 'rgb(36, 40, 43)');
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Reduce visual effects lives in the same open Settings menu.
      await page.getByLabel('Reduce visual effects').check();
      await expect(page.locator('.price-plot')).toHaveCSS('box-shadow', 'none');
      await expect(
        page.getByRole('button', { name: '6M', exact: true }),
      ).toHaveCSS('box-shadow', 'none');
      await page.getByLabel('Reduce visual effects').uncheck();
      await page.screenshot({
        path: `verification/screenshots/${id}-${width}.png`,
        fullPage: true,
      });
      if (
        id === 'ocean-blue' ||
        id === 'plum-noir' ||
        id === 'terminal-amber'
      ) {
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', id);
        if (id === 'terminal-amber') {
          await expect(page.locator('html')).toHaveCSS(
            'font-family',
            /Consolas/,
          );
          await expect(page.locator('.price-plot')).toHaveCSS(
            'border-radius',
            '2px',
          );
        }
        await page
          .getByRole('button', { name: 'Settings', exact: true })
          .click();
        await page
          .getByLabel('Font style', { exact: true })
          .selectOption('arial');
        await expect(page.locator('html')).toHaveCSS('font-family', /Arial/);
        await page
          .getByRole('button', { name: 'Increase font size', exact: true })
          .click();
        await expect(page.locator('#settings-menu')).toHaveCSS(
          'background-color',
          id === 'ocean-blue'
            ? 'rgb(242, 248, 255)'
            : id === 'terminal-amber'
              ? 'rgb(0, 0, 0)'
              : 'rgb(43, 34, 54)',
        );
        await page
          .getByRole('button', { name: 'Default', exact: true })
          .click();
        await page.keyboard.press('Escape');
        await page
          .getByRole('button', { name: 'Settings', exact: true })
          .click();
      }
      if (width === 1440) {
        await page
          .locator('#settings-menu')
          .screenshot({ path: `verification/screenshots/${id}-picker.png` });
        if (id === 'frosted-mono') {
          await page.screenshot({
            path: 'verification/screenshots/frosted-mono-header.png',
          });
        }
      }
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      'frosted-mono',
    );
    await expect(chart.locator('canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: 'Glass Light' }).check();
    await expect(chart).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.theme-option').first()).toHaveCSS(
      'box-shadow',
      'none',
    );
    await page.getByRole('radio', { name: 'Glass Light' }).press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: 'Soft Clay', exact: true }),
    ).toBeChecked();
    await page
      .getByRole('radio', { name: 'Soft Clay', exact: true })
      .press('Escape');
    await expect(page.locator('#settings-menu')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('.app-header').click({ position: { x: 1, y: 1 } });
    await expect(page.locator('#settings-menu')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('a saved Notebook theme restores with its font before the chart draws', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Notebook', exact: true }).check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'notebook');
  // Startup waits for the font, so it is ready by the time the app renders.
  await page.getByRole('button', { name: /Try Demo/ }).click();
  const chart = page.getByTestId('price-chart');
  await expect(chart.locator('canvas').first()).toBeVisible();
  expect(
    await page.evaluate(() => document.fonts.check("16px 'Patrick Hand'")),
  ).toBe(true);
  await expect(chart).toHaveCSS('background-color', 'rgb(255, 254, 249)');
  await page.screenshot({
    path: 'verification/screenshots/notebook-restored.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
