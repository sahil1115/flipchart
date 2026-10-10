import { expect, test } from '@playwright/test';
async function waitShell(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
test('offline reopening retains demo, parameters and provenance without provider requests', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await waitShell(page);
  await page.getByText('Calculation parameters', { exact: true }).click();
  await page.getByLabel('RSI period', { exact: true }).fill('7');
  await page
    .getByRole('button', { name: 'Apply parameters', exact: true })
    .click();
  const date = await page
    .locator('footer .footer-attribution')
    .first()
    .textContent();
  await page.unrouteAll();
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    }),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'RSI 7', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Offline. Demo' }),
  ).toBeVisible();
  await expect(page.locator('footer .footer-attribution').first()).toHaveText(
    date!,
  );
  await page
    .getByRole('button', { name: 'Data connection', exact: true })
    .click();
  await page.getByLabel('Twelve Data API key').fill('fixture-offline-only');
  await page.getByRole('button', { name: 'Use key', exact: true }).click();
  await page
    .getByRole('button', { name: 'Test Connection', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('You are offline');
});
test('saved CSV reopens offline and SW caches contain app assets only, with no key or provider response', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'offline.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'date,open,high,low,close,volume\n2026-10-01,10,12,9,11,100\n2026-10-02,11,13,10,12,200',
    ),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('OFFLINE');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('UTC');
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  await waitShell(page);
  await page.evaluate(async () => {
    await fetch('/provider-fixture?apikey=fixture-cannot-cache').catch(
      () => {},
    );
  });
  await page.unrouteAll();
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    }),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toContainText('Imported daily candles');
  await expect(page.locator('body')).toContainText('OFFLINE');
  const urls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(urls.length).toBeGreaterThan(0);
  expect(
    urls.every(
      (url) =>
        url.startsWith('http://127.0.0.1:4179/') &&
        !url.includes('fixture') &&
        !url.includes('apikey'),
    ),
  ).toBe(true);
  const authBlocked = await page.evaluate(
    async () =>
      await fetch('/index.html', {
        cache: 'no-store',
        headers: { Authorization: 'fixture' },
      })
        .then(() => false)
        .catch(() => true),
  );
  expect(authBlocked).toBe(true);
});
test('installation stays hidden until an install event is offered; a dismissed prompt leaves browser use available', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Install FlipChart', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  await page
    .getByRole('button', { name: 'Install FlipChart', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Installation dismissed' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByRole('region', { name: 'Price workspace' }),
  ).toBeVisible();
});
