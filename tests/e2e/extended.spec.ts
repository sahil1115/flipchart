import { expect, test } from '@playwright/test';
for (const width of [375, 768, 1440])
  test(`all selected indicators and local intervals remain usable at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [],
      external: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4179'))
        external.push(request.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: /Try Demo/ }).click();
    const names = [
      'Slow stochastic 14, 3, 3',
      'ADX / +DI / −DI 14',
      'CCI 20',
      'Williams %R 14',
      'ROC 12',
      'Historical volatility 20',
    ];
    for (const name of names) {
      await page.getByRole('checkbox', { name, exact: true }).check();
      await expect(
        page.getByRole('article', { name, exact: true }),
      ).toContainText('Latest valid');
    }
    const roc = page.getByRole('article', { name: 'ROC 12', exact: true });
    const value = await roc.locator('strong').textContent();
    const metrics = page.getByRole('region', {
      name: 'Daily coverage metrics',
    });
    const baseline = await metrics.textContent();
    expect(baseline).not.toContain('Unavailable');
    await page.getByRole('button', { name: '1M', exact: true }).click();
    await expect(roc.locator('strong')).toHaveText(value!);
    await expect(metrics).toHaveText(baseline!);
    await page.getByRole('checkbox', { name: 'ROC 12', exact: true }).uncheck();
    await expect(roc).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'ROC 12', exact: true }).check();
    await expect(roc.locator('strong')).toHaveText(value!);
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByLabel('Reduce visual effects').check();
    await expect(roc.locator('strong')).toHaveText(value!);
    await page.getByLabel('Interval', { exact: true }).selectOption('weekly');
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('weekly');
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('Previous-bar change');
    await expect(page.getByText(/Local weekly: first open/)).toBeVisible();
    await expect(roc).toContainText('weekly periods');
    await expect(
      page.getByRole('article', {
        name: 'Historical volatility 20',
        exact: true,
      }),
    ).toContainText('Latest valid');
    await page
      .getByRole('article', { name: 'Historical volatility 20', exact: true })
      .getByText('Calculation', { exact: true })
      .click();
    await expect(
      page.getByRole('article', {
        name: 'Historical volatility 20',
        exact: true,
      }),
    ).toContainText('√52');
    await expect(metrics).toHaveText(baseline!);
    await expect(
      page.getByRole('article', { name: 'SMA', exact: true }),
    ).toContainText('Needs 200 finalized bars');
    await page.getByLabel('Interval', { exact: true }).selectOption('monthly');
    await expect(roc).toContainText('monthly periods');
    await expect(page.getByText(/Local monthly: first open/)).toBeVisible();
    await expect(
      page.getByRole('article', {
        name: 'Historical volatility 20',
        exact: true,
      }),
    ).toContainText('√12');
    await expect(metrics).toHaveText(baseline!);
    await page.getByLabel('Interval', { exact: true }).selectOption('daily');
    await expect(roc.locator('strong')).toHaveText(value!);
    await page.mouse.move(0, 0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('region', { name: 'Price workspace' }).screenshot({
      path: `verification/screenshots/extended-chart-${width}.png`,
    });
    await page.getByRole('region', { name: 'Indicator workspace' }).screenshot({
      path: `verification/screenshots/extended-cards-${width}.png`,
    });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
test('short daily source cannot fabricate 52-week coverage or monthly indicator availability', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  const rows = Array.from(
    { length: 40 },
    (_, i) =>
      `${new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10)},10,10,10,10,0`,
  );
  await page.getByLabel('CSV file').setInputFiles({
    name: 'flat.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,open,high,low,close,volume\n' + rows.join('\n')),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('FLAT');
  await page.getByLabel('Currency', { exact: true }).fill('GBP');
  await page
    .getByLabel('Exchange timezone', { exact: true })
    .fill('Europe/London');
  await page
    .getByLabel('Price adjustment', { exact: true })
    .selectOption('raw');
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  const metric = page.getByRole('region', { name: 'Daily coverage metrics' });
  await expect(metric).toContainText('Unavailable');
  await page.getByRole('checkbox', { name: 'CCI 20', exact: true }).check();
  await expect(
    page
      .getByRole('article', { name: 'CCI 20', exact: true })
      .locator('strong'),
  ).toHaveText('0');
  await page.getByLabel('Interval', { exact: true }).selectOption('monthly');
  await expect(
    page.getByRole('article', { name: 'CCI 20', exact: true }),
  ).toContainText('Unavailable');
  await expect(
    page.getByRole('article', { name: 'CCI 20', exact: true }),
  ).toContainText('monthly periods');
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('GBP');
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('Europe/London');
  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('raw prices');
  await expect(metric).toContainText('Unavailable');
});
