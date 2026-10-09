import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ownCsv =
  'date,open,high,low,close,volume,notes\n2024-01-04,12,14,11,13,20,"Last bar"\n2024-01-02,10,13,9,12,,"Company, Inc. says ""hello"""\n2024-01-03,12,13,11,12,0,"No volume traded"';
async function prepare(page: Page, csv = ownCsv, name = 'own-prices.csv') {
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page
    .getByLabel('CSV file')
    .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(
    page.getByRole('heading', { name: '1. Map the columns' }),
  ).toBeVisible();
  await page.getByLabel('Listing symbol', { exact: true }).fill('OWN');
  await page
    .getByLabel('Listing name (optional)', { exact: true })
    .fill('My imported listing');
  await page.getByLabel('Currency', { exact: true }).fill('INR');
  await page
    .getByLabel('Exchange timezone', { exact: true })
    .fill('Asia/Kolkata');
  await page
    .getByLabel('Price adjustment', { exact: true })
    .selectOption('raw');
}
async function load(page: Page) {
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: /Ready to load/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('OWN');
  await expect(
    page.getByRole('button', { name: 'Open dataset OWN import' }),
  ).toBeEnabled();
}
for (const width of [375, 768, 1440]) {
  test(`CSV preview, import and reload retain honest identity at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4173'))
        external.push(request.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await prepare(page);
    await expect(page.getByRole('table')).toContainText(
      'Company, Inc. says "hello"',
    );
    await page
      .getByRole('button', { name: 'Validate data', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Ready to load 3 daily bars' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/import-preview-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Load imported data', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Open dataset OWN import' }),
    ).toBeEnabled();
    const summary = page.getByRole('region', { name: 'Dataset summary' });
    await expect(summary).toContainText('IMPORT');
    await expect(summary).toContainText('INR');
    await expect(summary).toContainText('Asia/Kolkata');
    await expect(summary).toContainText('2024-01-04');
    await expect(summary).not.toContainText('SYNTHETIC');
    await expect(page.locator('.header-status')).toContainText('Imported CSV');
    await expect(page.getByText(/1 bar has unknown volume/)).toBeVisible();
    await expect(
      page.getByTestId('price-chart').locator('canvas').first(),
    ).toBeVisible();
    await page.getByLabel('Chart view').selectOption('line');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByLabel('Reduce visual effects').check();
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('OWN');
    await expect(page.getByLabel('Chart view')).toHaveValue('line');
    await expect(
      page.getByRole('button', { name: 'All', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute(
      'data-reduced-effects',
      'true',
    );
    await expect(page.locator('.source-note')).toContainText(
      'User CSV · own-prices.csv',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/screenshots/import-loaded-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Delete dataset OWN import' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Start with a clearer view.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Recent datasets and listings' }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('price-chart')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
test('row-specific errors, explicit date formats, mapping and template download', async ({
  page,
}) => {
  await page.goto('/');
  await prepare(page, 'Session,O,H,L,C\n02/03/2024,10,13,9,12', 'custom.csv');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV template' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    'flipchart-daily-template.csv',
  );
  for (const [field, index] of Object.entries({
    date: 0,
    open: 1,
    high: 2,
    low: 3,
    close: 4,
  }))
    await page
      .getByLabel(field + ' column', { exact: true })
      .selectOption(String(index));
  await page.getByRole('button', { name: 'Validate data' }).click();
  await expect(page.getByRole('alert')).toContainText('CSV record 2');
  await page.getByLabel('Date format').selectOption('day-first');
  await load(page);
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('2024-03-02');
  await expect(page.getByText(/Volume pane unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Change data' }).click();
  await prepare(page, 'date,open,high,low,close\n2024-01-02,10,9,8,12');
  await page.getByRole('button', { name: 'Validate data' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'low ≤ open/close ≤ high',
  );
  await expect(
    page.getByRole('button', { name: 'Load imported data' }),
  ).toHaveCount(0);
});
test('cache deletion and preference reset have independent scopes', async ({
  page,
}) => {
  await page.goto('/');
  await prepare(page);
  await load(page);
  await page.getByRole('button', { name: 'Change data' }).click();
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open dataset FLIP demo' }),
  ).toBeEnabled();
  await page.getByLabel('Chart view').selectOption('area');
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel('Reduce visual effects').check();
  await page
    .getByRole('button', { name: 'Reset Preferences', exact: true })
    .click();
  await expect(page.getByLabel('Chart view')).toHaveValue('candles');
  await expect(
    page.getByRole('button', { name: '6M', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute(
    'data-reduced-effects',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Delete dataset OWN import' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete dataset OWN import' }).click();
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('FLIP');
  await expect(
    page.getByRole('button', { name: 'Clear Cache', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Clear Cache', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Recent datasets and listings' }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('price-chart')).toHaveCount(0);
});
test('5,000-row import loads and restores without credentials', async ({
  page,
}) => {
  const rows = Array.from(
    { length: 5000 },
    (_, i) =>
      new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10) +
      ',10,13,9,12,100',
  );
  await page.goto('/');
  await prepare(
    page,
    'date,open,high,low,close,volume\n' + rows.reverse().join('\n'),
    '5000.csv',
  );
  await load(page);
  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('5,000 bars');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('5,000 bars');
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
});
for (const failure of ['denied', 'quota']) {
  test(
    'storage ' + failure + ' falls back to usable session data',
    async ({ page }) => {
      await page.addInitScript((mode) => {
        if (mode === 'denied') {
          Object.defineProperty(window, 'indexedDB', {
            get() {
              throw new DOMException('fixture denied', 'SecurityError');
            },
          });
          Storage.prototype.getItem = () => {
            throw new Error('fixture denied');
          };
          Storage.prototype.setItem = () => {
            throw new Error('fixture denied');
          };
        } else
          IDBObjectStore.prototype.put = () => {
            throw new DOMException('fixture quota', 'QuotaExceededError');
          };
      }, failure);
      await page.goto('/');
      await prepare(page);
      await load(page);
      await expect(
        page.getByText(/Data and changes remain usable for this session only/),
      ).toBeVisible();
      await expect(
        page.getByTestId('price-chart').locator('canvas').first(),
      ).toBeVisible();
      await page.getByLabel('Chart view').selectOption('area');
      await expect(page.getByLabel('Chart view')).toHaveValue('area');
      await page.reload();
      await expect(page.getByTestId('price-chart')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /Try Demo/ }),
      ).toBeVisible();
    },
  );
}

test('incomplete trailing candles remain visibly provisional after reload', async ({
  page,
}) => {
  await page.goto('/');
  await prepare(page);
  await page.getByLabel('Last daily candle is incomplete').check();
  await load(page);
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('PROVISIONAL');
  await expect(
    page.getByText(/Latest candle \(2024-01-04\) is incomplete/),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('PROVISIONAL');
});
test('missing metadata and conflicting duplicates give actionable feedback without loading', async ({
  page,
}) => {
  await page.goto('/');
  await prepare(
    page,
    'date,open,high,low,close,volume\n2024-01-02,10,13,9,12,1\n2024-01-02,10,13,9,11,1',
  );
  await page.getByLabel('Currency', { exact: true }).fill('');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Validate data' }).click();
  await expect(page.getByRole('alert')).toContainText('currency');
  await expect(page.getByRole('alert')).toContainText('timezone');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('UTC');
  await page.getByRole('button', { name: 'Validate data' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'CSV record 3: conflicting duplicate date 2024-01-02',
  );
  await expect(page.getByTestId('price-chart')).toHaveCount(0);
});
