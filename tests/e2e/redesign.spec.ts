import { expect, test } from '@playwright/test';

for (const width of [375, 1440]) {
  test(`split workspace keeps inspection and indicator panes usable at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    await page.mouse.move(0, 0);
    const close = page.locator('.summary-price > strong');
    const latest = await close.textContent();
    const coverage = page.getByRole('region', {
      name: 'Daily coverage metrics',
    });
    const dailyMetrics = await coverage.textContent();
    const height = await chart.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    for (const name of ['MACD', 'ADX', 'Stoch', 'OBV', 'RSI']) {
      await page
        .getByRole('button', { name: `Plot ${name}`, exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: `Plot ${name}`, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() =>
          chart.evaluate((element) => element.getBoundingClientRect().height),
        )
        .toBe(height);
      await expect(close).toHaveText(latest!);
    }
    await page
      .getByRole('button', { name: 'Inspect previous bar', exact: true })
      .click();
    const legend = page.locator('.chart-legend');
    await expect(legend).toContainText('Cursor · pinned');
    const pinnedDate = (await legend.textContent())!.match(
      /\d{4}-\d{2}-\d{2}/,
    )![0];
    await page.mouse.move(0, 0);
    await expect(
      page.getByRole('article', { name: 'RSI 14', exact: true }),
    ).toContainText(pinnedDate);
    await expect(
      page.getByRole('article', { name: 'Raw volume', exact: true }),
    ).toContainText(pinnedDate);
    await expect(page.locator('.readout-heading')).toHaveClass(/inspecting/);
    await expect(close).toHaveText(latest!);
    await expect(coverage).toHaveText(dailyMetrics!);
    await chart.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(legend).not.toContainText(pinnedDate);
    await page
      .getByRole('button', { name: 'Back to latest', exact: true })
      .click();
    await expect(legend).toContainText('Latest bar');
    await chart.scrollIntoViewIfNeeded();
    const bounds = await chart.boundingBox();
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + 100);
    await page.mouse.move(0, 0);
    await expect(legend).toContainText('Cursor · pinned');
    await page.getByRole('button', { name: /Reset view/ }).click();
    await page.mouse.move(0, 0);
    await expect(legend).toContainText('Latest bar');
    await page
      .getByRole('button', { name: 'Inspect previous bar', exact: true })
      .click();
    await page.getByLabel('Interval', { exact: true }).selectOption('weekly');
    await expect(legend).toContainText('Latest bar');
    await expect(coverage).toHaveText(dailyMetrics!);
    await page.getByLabel('Interval', { exact: true }).selectOption('daily');
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    await page
      .getByRole('radio', { name: 'Frosted Mono', exact: true })
      .check();
    await page.keyboard.press('Escape');
    await page.evaluate(() => scrollTo(0, 0));
    if (width === 1440) {
      const positions = await page
        .locator('.focus-workspace')
        .evaluate((element) => {
          const plot = element
            .querySelector('.chart-panel')!
            .getBoundingClientRect();
          const rail = element
            .querySelector('.readout-rail')!
            .getBoundingClientRect();
          return { right: plot.right, left: rail.left };
        });
      expect(positions.left).toBeGreaterThan(positions.right);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/redesign-${width}.png`,
      fullPage: true,
    });
    if (width === 1440) await page.setViewportSize({ width, height: 1200 });
    if (width === 1440)
      await page.screenshot({
        path: 'verification/screenshots/redesign-desktop-preview.png',
      });
    expect(errors).toEqual([]);
  });
}
