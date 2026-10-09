import { expect, test } from '@playwright/test';

for (const width of [375, 768, 1440]) {
  test(`production demo and controls fit at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    const externalRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173'))
        externalRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Start with a clearer view.' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: /Import CSV/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Bring your own daily data' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel import' }).click();
    await page.getByRole('button', { name: /Connect Provider/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Connect Twelve Data' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close connection panel' }).click();
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    await chart.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const canvasCount = await chart.locator('canvas').count();
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('Previous-session change');
    await page.getByLabel('Chart view').selectOption('line');
    await page.getByLabel('Chart view').selectOption('area');
    await page.getByLabel('Chart view').selectOption('candles');
    await page.getByRole('button', { name: '1M', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '1M', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await chart.scrollIntoViewIfNeeded();
    const bounds = await chart.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) {
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 100);
      await expect(page.locator('.chart-legend')).toContainText('Cursor');
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + 100, {
        steps: 5,
      });
      await page.mouse.up();
      await page.mouse.wheel(0, -120);
    }
    await page.getByRole('button', { name: /Reset view/ }).click();
    await page.screenshot({
      path: `verification/screenshots/demo-glass-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByLabel('Reduce visual effects').check();
    await expect(page.locator('html')).toHaveAttribute(
      'data-reduced-effects',
      'true',
    );
    expect(
      await page
        .locator('.chart-panel')
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe('none');
    expect(
      await page
        .locator('.chart-panel')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe('rgb(255, 255, 255)');
    expect(
      await page
        .locator('.reset-button')
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe('rgb(32, 45, 70)');
    expect(
      await page
        .locator('.price-chart')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe('rgb(252, 253, 255)');
    expect(await chart.locator('canvas').count()).toBe(canvasCount);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/demo-${width}.png`,
      fullPage: true,
    });
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Change data' }).click();
      await expect(page.getByTestId('price-chart')).toHaveCount(0);
      await page.getByRole('button', { name: /Try Demo/ }).click();
      await expect(chart.locator('canvas')).toHaveCount(canvasCount);
    }
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
}

test('keyboard navigation, reduced motion, and unknown stored theme', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'flipchart:appearance',
      JSON.stringify({ version: 1, themeId: 'unknown', reducedEffects: false }),
    ),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    'glass-light',
  );
  await expect(page.getByRole('button', { name: /Try Demo/ })).toBeVisible();
  const skip = page.getByRole('link', { name: 'Skip to workspace' });
  if (testInfo.project.name === 'webkit') {
    // Windows WebKit's native link traversal differs from Safari OS settings.
    // Verify focus/keyboard activation; actual OS Tab traversal remains pending.
    await skip.focus();
  } else {
    await page.keyboard.press('Tab');
  }
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();
  await page.getByRole('button', { name: /Try Demo/ }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '1Y', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('button', { name: '1Y', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('opaque base styling remains usable when the backdrop support rule is absent', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
        const rule = sheet.cssRules[index];
        if (
          rule instanceof CSSSupportsRule &&
          rule.conditionText.includes('backdrop-filter')
        )
          sheet.deleteRule(index);
      }
    }
  });
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  expect(
    await page
      .locator('.chart-panel')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  expect(
    await page
      .locator('.chart-panel')
      .evaluate((element) => getComputedStyle(element).backdropFilter),
  ).toBe('none');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel('Reduce visual effects').check();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-reduced-effects',
    'true',
  );
});
