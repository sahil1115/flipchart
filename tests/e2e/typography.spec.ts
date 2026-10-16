import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
for (const width of [375, 1440]) {
  test(`text controls preserve charts and restore readable fonts at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    await page.getByTestId('price-chart').locator('canvas').first().waitFor();
    await page
      .getByRole('button', { name: 'Inspect previous bar', exact: true })
      .click();
    await page.mouse.move(0, 0);
    const legend = page.locator('.chart-legend');
    const date = (await legend.textContent())!.match(/\d{4}-\d{2}-\d{2}/)![0];
    const rsi = page.getByRole('article', { name: 'RSI 14', exact: true });
    const value = await rsi.locator('strong').textContent();
    const originalSize = await rsi
      .locator('strong')
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const control = page.getByRole('button', { name: 'Settings', exact: true });
    await page
      .getByLabel('Export scope', { exact: true })
      .selectOption('visible');
    const visibleWindow = async () => {
      const download = page.waitForEvent('download');
      await page
        .getByRole('button', { name: 'Download export metadata', exact: true })
        .click();
      const metadata = JSON.parse(
        await readFile((await (await download).path())!, 'utf8'),
      );
      await page.mouse.move(0, 0);
      return metadata.logicalWindow as { from: number; to: number };
    };
    const beforeWindow = await visibleWindow();
    await control.click();
    // The Settings menu opens on the current theme, with text controls below.
    await expect(
      page.getByRole('radio', { name: 'Glass Light', exact: true }),
    ).toBeFocused();
    const picker = page.locator('#settings-menu');
    await expect(picker).toHaveCSS('background-color', 'rgb(246, 250, 255)');
    await expect(picker.getByRole('option')).toHaveCount(3);
    await page
      .getByLabel('Font style', { exact: true })
      .selectOption('verdana');
    for (let i = 0; i < 4; i++)
      await page
        .getByRole('button', { name: 'Increase font size', exact: true })
        .click();
    await expect(page.getByLabel('Font size', { exact: true })).toHaveText(
      '140%',
    );
    await expect(
      page.getByRole('button', { name: 'Increase font size', exact: true }),
    ).toBeDisabled();
    await expect(page.locator('html')).toHaveCSS('font-family', /Verdana/);
    await expect
      .poll(() =>
        rsi
          .locator('strong')
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          ),
      )
      .toBeCloseTo(originalSize * 1.4, 1);
    await expect(legend).toContainText(date);
    await expect(rsi.locator('strong')).toHaveText(value!);
    await expect
      .poll(() =>
        page.locator('.split-charts').evaluate((element) => {
          const widths = ['price-chart', 'volume-chart', 'indicator-chart'].map(
            (id) =>
              element
                .querySelector(`[data-testid="${id}"] canvas`)!
                .getBoundingClientRect().width,
          );
          return widths.every((width) => width > 0 && width === widths[0]);
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const popup = await picker.boundingBox();
    expect(popup!.x).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `verification/screenshots/text-controls-${width}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(control).toBeFocused();
    await expect(picker).toHaveCount(0);
    const afterWindow = await visibleWindow();
    expect(afterWindow.from).toBeCloseTo(beforeWindow.from, 1);
    expect(afterWindow.to).toBeCloseTo(beforeWindow.to, 1);
    await page.reload();
    await control.click();
    await expect(page.getByLabel('Font style', { exact: true })).toHaveValue(
      'verdana',
    );
    await expect(page.getByLabel('Font size', { exact: true })).toHaveText(
      '140%',
    );
    await page.getByLabel('Font style', { exact: true }).selectOption('arial');
    await expect(page.locator('html')).toHaveCSS('font-family', /Arial/);
    for (let i = 0; i < 5; i++)
      await page
        .getByRole('button', { name: 'Decrease font size', exact: true })
        .click();
    await expect(page.getByLabel('Font size', { exact: true })).toHaveText(
      '90%',
    );
    await expect(
      page.getByRole('button', { name: 'Decrease font size', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Default', exact: true }).click();
    await expect(page.getByLabel('Font style', { exact: true })).toHaveValue(
      'system',
    );
    await expect(page.getByLabel('Font size', { exact: true })).toHaveText(
      '100%',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByRole('radio', { name: 'Midnight Clay', exact: true })
      .check();
    await page.keyboard.press('Escape');
    await control.click();
    await page.getByLabel('Font style', { exact: true }).selectOption('arial');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Settings/ }).click();
    await page
      .getByRole('button', { name: 'Reset Preferences', exact: true })
      .click();
    // The Settings menu stays open after a reset, with text controls visible.
    await expect(page.getByLabel('Font style', { exact: true })).toHaveValue(
      'system',
    );
    await expect(page.getByLabel('Font size', { exact: true })).toHaveText(
      '100%',
    );
    expect(errors).toEqual([]);
  });
}
