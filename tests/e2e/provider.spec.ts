import { expect, test } from '@playwright/test';
// Provider routing is tested separately from real service-worker integration.
// Browser engines cannot consistently intercept SW-controlled external fetches.
test.use({ serviceWorkers: 'block' });
import type { Page } from '@playwright/test';
import {
  fixtureCredential,
  historyResponse,
  listing,
  secondListing,
  searchResponse,
  usageResponse,
} from '../fixtures/twelve-data';

async function fixtureProvider(page: Page) {
  const requests: URL[] = [];
  const errors: string[] = [];
  let failure: number | 'network' | null = null;
  let hold: (() => Promise<void>) | null = null;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
  await page.route('https://api.twelvedata.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization',
        },
      });
      return;
    }
    const url = new URL(request.url());
    expect(url.searchParams.has('apikey')).toBe(false);
    expect(request.headers().authorization).toBe(`apikey ${fixtureCredential}`);
    requests.push(url);
    if (url.pathname === '/time_series' && hold) await hold();
    if (url.pathname === '/time_series' && failure === 'network') {
      await route.abort('failed');
      return;
    }
    const payload =
      url.pathname === '/symbol_search'
        ? searchResponse
        : url.pathname === '/api_usage'
          ? usageResponse
          : failure
            ? {
                status: 'error',
                code: failure,
                message: `provider error with secret ${fixtureCredential}`,
              }
            : historyResponse(
                url.searchParams.get('mic_code') === 'XLON'
                  ? secondListing
                  : listing,
              );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(payload),
    });
  });
  return {
    requests,
    errors,
    fail: (value: typeof failure) => {
      failure = value;
    },
    hold: (value: typeof hold) => {
      hold = value;
    },
  };
}
async function connect(page: Page, remember = false) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Data connection', exact: true })
    .click();
  const key = page.getByLabel('Twelve Data API key');
  await expect(key).toHaveAttribute('type', 'password');
  await key.fill(fixtureCredential);
  if (remember) await page.getByLabel('Remember on this device').check();
  await page.getByRole('button', { name: 'Use key', exact: true }).click();
}
async function chooseListing(page: Page, exchange = 'NASDAQ') {
  await page.getByLabel('Search symbol or company').fill('FI');
  await page
    .getByRole('button', { name: new RegExp(`FIX · ${exchange}`) })
    .click();
}
async function loaded(page: Page, currency = 'USD') {
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText(currency);
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  await expect(page.locator('.provider-panel')).toContainText(
    'Loaded 240 daily bars',
  );
}
for (const width of [375, 768, 1440]) {
  test(`fixture connection and daily chart fit at ${width}px; controls consume no credits`, async ({
    page,
  }) => {
    const fixture = await fixtureProvider(page);
    await page.setViewportSize({ width, height: 1000 });
    await connect(page);
    expect(fixture.requests).toHaveLength(0);
    await page.getByRole('button', { name: 'Show key' }).click();
    await expect(page.getByLabel('Twelve Data API key')).toHaveAttribute(
      'type',
      'text',
    );
    await page.getByRole('button', { name: 'Hide key' }).click();
    await page
      .getByRole('button', { name: 'Test Connection', exact: true })
      .click();
    await expect(page.locator('.provider-panel')).toContainText(
      'Provider-reported usage: 2/8',
    );
    await page.getByRole('heading', { name: 'Connect Twelve Data' }).click();
    await page.keyboard.press('/');
    await expect(page.getByLabel('Search symbol or company')).toBeFocused();
    await chooseListing(page);
    expect(fixture.requests.map((url) => url.pathname)).toEqual([
      '/api_usage',
      '/symbol_search',
    ]);
    await page
      .getByRole('button', { name: 'Load history', exact: true })
      .click();
    await loaded(page);
    await expect(page.locator('footer')).toContainText(
      'Fetched from provider:',
    );
    await expect(page.locator('footer')).toContainText('Data date: 2026-10-08');
    await expect(page.locator('footer')).toContainText('Delay: unknown');
    await expect(
      page.getByRole('link', {
        name: 'Data provided by Twelve Data',
        exact: true,
      }),
    ).toBeVisible();
    const history = fixture.requests.at(-1)!;
    expect(history.searchParams.get('mic_code')).toBe('XNAS');
    expect(history.searchParams.get('start_date')! < '2025-10-09').toBe(true);
    await page
      .getByRole('button', { name: 'Load history', exact: true })
      .click();
    await loaded(page);
    await page.getByRole('button', { name: '1M', exact: true }).click();
    await page.getByLabel('Chart view').selectOption('line');
    await page.getByRole('checkbox', { name: 'EMA', exact: true }).check();
    await page.getByText('Calculation parameters', { exact: true }).click();
    await page.getByLabel('RSI period', { exact: true }).fill('7');
    await page
      .getByRole('button', { name: 'Apply parameters', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'RSI 7', exact: true }),
    ).toContainText('Latest valid');
    await page.getByRole('button', { name: /Settings/ }).click();
    await page.getByLabel('Reduce visual effects').check();
    await page.getByLabel('Interval', { exact: true }).selectOption('weekly');
    await expect(
      page.getByRole('region', { name: 'Dataset summary' }),
    ).toContainText('weekly');
    await page.getByLabel('Interval', { exact: true }).selectOption('monthly');
    await page.getByLabel('Interval', { exact: true }).selectOption('daily');
    await page.getByLabel('History window').selectOption('3Y');
    await page.getByLabel('Provider price adjustment').selectOption('adjusted');
    expect(fixture.requests).toHaveLength(3);
    await page
      .getByRole('button', { name: 'Load history', exact: true })
      .click();
    await loaded(page);
    expect(fixture.requests.at(-1)!.searchParams.get('adjust')).toBe('all');
    expect(fixture.requests).toHaveLength(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toContain(fixtureCredential);
    await page.screenshot({
      path: `verification/screenshots/provider-${width}.png`,
      fullPage: true,
    });
    expect(fixture.errors).toEqual([]);
  });
}
test('exchange selection separates caches; failed refresh preserves the chart and manual recovery clears stale state', async ({
  page,
}) => {
  const fixture = await fixtureProvider(page);
  await connect(page);
  await chooseListing(page);
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await loaded(page);
  fixture.fail(429);
  await page.getByRole('button', { name: 'Refresh loaded data' }).click();
  await expect(page.getByRole('alert')).toContainText('quota is exhausted');
  await expect(page.getByRole('alert')).not.toContainText(fixtureCredential);
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('Stale loaded data');
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  expect(fixture.requests).toHaveLength(3);
  fixture.fail(null);
  await page.getByRole('button', { name: 'Refresh loaded data' }).click();
  await loaded(page);
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).not.toContainText('Stale loaded data');
  await page.getByRole('button', { name: /FIX · LSE/ }).click();
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await loaded(page, 'GBP');
  expect(fixture.requests.at(-1)!.searchParams.get('mic_code')).toBe('XLON');
  await expect(page.locator('footer')).toContainText('Europe/London');
  expect(fixture.errors).toEqual([]);
});
for (const [failure, message] of [
  [401, 'rejected the key'],
  [404, 'listing is unavailable'],
  [500, 'temporarily unavailable'],
  ['network', 'Could not reach Twelve Data'],
] as const) {
  test(`browser failure ${failure} never substitutes demo or retries`, async ({
    page,
  }) => {
    const fixture = await fixtureProvider(page);
    await connect(page);
    await chooseListing(page);
    fixture.fail(failure);
    await page
      .getByRole('button', { name: 'Load history', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('alert')).not.toContainText(fixtureCredential);
    await expect(page.getByTestId('price-chart')).toHaveCount(0);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.errors).toEqual([]);
  });
}
test('remember is explicit; reload makes no requests; preference/cache controls retain key; disconnect retains demo library', async ({
  page,
}) => {
  const fixture = await fixtureProvider(page);
  await connect(page, true);
  await page.getByRole('button', { name: 'Close connection panel' }).click();
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Data connection', exact: true })
    .click();
  await expect(page.getByLabel('Twelve Data API key')).toHaveValue(
    fixtureCredential,
  );
  await expect(page.getByLabel('Twelve Data API key')).toHaveAttribute(
    'type',
    'password',
  );
  expect(fixture.requests).toHaveLength(0);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Reset Preferences' }).click();
  await expect(page.getByLabel('Remember on this device')).toBeChecked();
  await chooseListing(page);
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await loaded(page);
  const stored = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('flipchart-datasets', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('library')
            .objectStore('library')
            .get('current');
          read.onsuccess = () => {
            resolve(JSON.stringify(read.result));
            db.close();
          };
        };
      }),
  );
  expect(stored).not.toContain(fixtureCredential);
  expect(stored).not.toContain('twelve-data');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByTestId('price-chart')).toHaveCount(0);
  await expect(page.getByLabel('Twelve Data API key')).toHaveValue('');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('flipchart:credential:twelve-data'),
    ),
  ).toBeNull();
  await page.getByRole('button', { name: /Open dataset .* demo/ }).click();
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('SYNTHETIC');
  expect(fixture.requests).toHaveLength(2);
});
test('cancelled slow history cannot replace demo selected afterward', async ({
  page,
}) => {
  const fixture = await fixtureProvider(page);
  await connect(page);
  await chooseListing(page);
  let release = () => {};
  fixture.hold(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await expect.poll(() => fixture.requests.length).toBe(2);
  await page.getByRole('button', { name: 'Cancel provider request' }).click();
  await page.getByRole('button', { name: 'Close connection panel' }).click();
  await page.getByRole('button', { name: /Try Demo/ }).click();
  release();
  await expect(
    page.getByRole('region', { name: 'Dataset summary' }),
  ).toContainText('SYNTHETIC');
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  expect(fixture.errors).toEqual([]);
});
test('search debounces typing; slash stays in an input; Clear Cache retains credentials but forces the next explicit load', async ({
  page,
}) => {
  const fixture = await fixtureProvider(page);
  await connect(page, true);
  await page
    .getByLabel('Search symbol or company')
    .pressSequentially('FICT', { delay: 50 });
  await page.getByRole('button', { name: /FIX · NASDAQ/ }).click();
  expect(fixture.requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await loaded(page);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Clear Cache', exact: true }).click();
  await expect(page.getByTestId('price-chart')).toHaveCount(0);
  await expect(page.getByLabel('Twelve Data API key')).toHaveValue(
    fixtureCredential,
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem('flipchart:credential:twelve-data'),
    ),
  ).toContain(fixtureCredential);
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await loaded(page);
  expect(fixture.requests).toHaveLength(3);
  await page.getByLabel('Twelve Data API key').focus();
  await page.keyboard.press('/');
  await expect(page.getByLabel('Twelve Data API key')).toBeFocused();
});
test('denied credential storage still supports a memory connection and daily load', async ({
  page,
}) => {
  const fixture = await fixtureProvider(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'flipchart:credential:twelve-data')
        throw new DOMException('denied', 'SecurityError');
      original.call(this, key, value);
    };
  });
  await connect(page, true);
  await expect(page.locator('.provider-panel')).toContainText(
    'Could not save the key. Connection works for this session only.',
  );
  await chooseListing(page);
  await page.getByRole('button', { name: 'Load history', exact: true }).click();
  await loaded(page);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain(fixtureCredential);
  expect(fixture.errors).toEqual([]);
});
