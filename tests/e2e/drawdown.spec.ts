import { expect, test } from '@playwright/test';
test.use({ serviceWorkers: 'block' });

test('the drawdown pane plots falls from the peak and remembers the choice', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Volatility', exact: true }).click();
  const tab = page.getByRole('button', { name: 'Plot Drawdown', exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
  const pane = page.locator('.indicator-plot');
  await expect(pane.locator('.pane-caption')).toContainText('Drawdown %');
  await expect(pane.locator('.pane-caption')).toContainText('Worst so far %');
  await expect(
    page.getByTestId('indicator-chart').locator('canvas').first(),
  ).toBeVisible();
  await expect(pane.locator('.plot-unavailable')).toHaveCount(0);
  // Drawdown is never above zero, and the worst reading is never above the current one.
  const [current, worst] = (
    await pane.locator('.pane-caption b').allInnerTexts()
  ).map((text) => Number(text.replace('−', '-')));
  expect(current).toBeLessThanOrEqual(0);
  expect(worst).toBeLessThanOrEqual(current!);

  // It can also be pinned in the readout.
  await page.getByRole('checkbox', { name: 'Drawdown' }).check();
  await expect(
    page.getByRole('article', { name: 'Drawdown', exact: true }),
  ).toContainText('Worst so far');

  // The demo dataset and the chosen pane are restored after a reload.
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Plot Drawdown', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: 'Drawdown' })).toBeChecked();
});
