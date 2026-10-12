import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

for (const width of [375, 1440]) {
  test(`readouts and plots remain independent with compact details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const chart = page.getByTestId('price-chart');
    await expect(chart.locator('canvas').first()).toBeVisible();
    const overlays = page.getByRole('group', { name: 'Price overlays' });
    const sma = page.getByRole('article', { name: 'SMA', exact: true });
    const ema = page.getByRole('article', { name: 'EMA', exact: true });
    const snapshot = async () => {
      await chart.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      // Wait for the shared axes to finish sizing before comparing drawings.
      await expect
        .poll(() =>
          page.locator('.split-charts').evaluate(async (element) => {
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            const widths = [
              'price-chart',
              'volume-chart',
              'indicator-chart',
            ].map(
              (id) =>
                element
                  .querySelector(`[data-testid="${id}"] canvas`)!
                  .getBoundingClientRect().width,
            );
            return widths.every((width) => width > 0 && width === widths[0]);
          }),
        )
        .toBe(true);
      // Compare the drawing itself: a translucent plot's backdrop changes on scroll.
      const drawing = await chart
        .locator('canvas')
        .evaluateAll(async (canvases) => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return canvases.map((canvas) =>
            (canvas as HTMLCanvasElement).toDataURL(),
          );
        });
      return createHash('sha256').update(JSON.stringify(drawing)).digest('hex');
    };
    const original = await snapshot();
    await page.getByRole('checkbox', { name: 'SMA', exact: true }).uncheck();
    await expect(sma).toHaveCount(0);
    await expect(
      overlays.getByRole('button', { name: 'SMA', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await snapshot()).toEqual(original);
    await page.getByRole('checkbox', { name: 'EMA', exact: true }).check();
    await expect(ema).toBeVisible();
    await expect(
      overlays.getByRole('button', { name: 'EMA', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(await snapshot()).toEqual(original);
    const emaValues = await ema.locator('strong').allTextContents();
    await overlays.getByRole('button', { name: 'EMA', exact: true }).click();
    const withEma = await snapshot();
    expect(withEma).not.toEqual(original);
    expect(await ema.locator('strong').allTextContents()).toEqual(emaValues);
    await page.getByRole('checkbox', { name: 'EMA', exact: true }).uncheck();
    await expect(
      overlays.getByRole('button', { name: 'EMA', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await snapshot()).toEqual(withEma);
    await page.getByRole('checkbox', { name: 'EMA', exact: true }).check();
    await overlays.getByRole('button', { name: 'SMA', exact: true }).click();
    await expect(sma).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'SMA', exact: true }).check();
    await expect(
      overlays.getByRole('button', { name: 'SMA', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page
      .getByRole('group', { name: 'Indicator categories' })
      .getByRole('button', { name: 'Volume', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Plot OBV', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('checkbox', { name: 'OBV', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByTestId('indicator-chart').locator('canvas').first(),
    ).toBeVisible();
    const momentum = page.getByRole('combobox', { name: 'Momentum overlay' });
    await expect(momentum).toHaveValue('');
    const readoutSelections = () =>
      page
        .locator('.readout-rail input[type="checkbox"]')
        .evaluateAll((inputs) =>
          inputs.map((input) => ({
            label: input.getAttribute('aria-label'),
            checked: (input as HTMLInputElement).checked,
          })),
        );
    const selections = await readoutSelections();
    const priceBeforeMomentum = await snapshot();
    const lowerDrawing = async () => {
      const images = await page
        .getByTestId('indicator-chart')
        .locator('canvas')
        .evaluateAll(async (canvases) => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          return canvases.map((canvas) =>
            (canvas as HTMLCanvasElement).toDataURL(),
          );
        });
      return createHash('sha256').update(JSON.stringify(images)).digest('hex');
    };
    const lowerBeforeMomentum = await lowerDrawing();
    for (const [id, name] of [
      ['macd', 'MACD'],
      ['stochastic', 'Stochastic'],
      ['cci', 'CCI'],
      ['williams', 'Williams'],
      ['roc', 'ROC'],
      ['rsi', 'RSI'],
    ]) {
      await momentum.selectOption(id!);
      await expect(page.getByTestId('momentum-overlay-legend')).toContainText(
        new RegExp(name!, 'i'),
      );
      await expect(page.getByTestId('momentum-overlay-legend')).toContainText(
        'independent scale',
      );
      await expect(
        page.getByRole('button', { name: 'Plot OBV', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      expect(await readoutSelections()).toEqual(selections);
      expect(await snapshot()).not.toEqual(priceBeforeMomentum);
      expect(await lowerDrawing()).toEqual(lowerBeforeMomentum);
    }
    await momentum.selectOption('');
    await expect(page.getByTestId('momentum-overlay-legend')).toHaveCount(0);
    expect(await snapshot()).toEqual(priceBeforeMomentum);
    await momentum.selectOption('macd');
    await page
      .getByRole('group', { name: 'Indicator categories' })
      .getByRole('button', { name: 'Momentum', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Plot RSI', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(momentum).toHaveValue('macd');
    const rsi = page.getByRole('article', { name: 'RSI 14', exact: true });
    const expand = page.getByRole('button', { name: 'Expand', exact: true });
    await expect(expand).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: /^Expand / })).toHaveCount(
      0,
    );
    await page.mouse.move(0, 0);
    const compactHeight = await rsi.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(compactHeight).toBeLessThan(90);
    await expect(
      rsi.getByText('Calculation', { exact: true }),
    ).not.toBeVisible();
    await expect(rsi.locator('strong')).toBeVisible();
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.dock-card:not(.expanded)')).toHaveCount(0);
    await expect(rsi.getByText('Calculation', { exact: true })).toBeVisible();
    expect(
      await rsi.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThan(compactHeight);
    await page.reload();
    await expect(momentum).toHaveValue('macd');
    await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.dock-card:not(.expanded)')).toHaveCount(0);
    await expect(
      overlays.getByRole('button', { name: 'EMA', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      overlays.getByRole('button', { name: 'SMA', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(sma).toBeVisible();
    await expand.click();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.dock-card.expanded')).toHaveCount(0);
    await expect(
      rsi.getByText('Calculation', { exact: true }),
    ).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('complementary', { name: 'Indicator values' })
      .screenshot({
        path: `verification/screenshots/compact-readouts-${width}.png`,
      });
  });
}
