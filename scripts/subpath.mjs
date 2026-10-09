import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

execFileSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist-subpath'],
  { stdio: 'inherit', env: { ...process.env, FLIPCHART_BASE: '/flipchart/' } },
);
const root = resolve('dist-subpath');
let revision = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4174');
  if (url.pathname === '/__verification-bump') {
    revision++;
    res.end('ok');
    return;
  }
  if (!url.pathname.startsWith('/flipchart/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = resolve(
    root,
    decodeURIComponent(url.pathname.slice('/flipchart/'.length)) ||
      'index.html',
  );
  if (!file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    let body = await readFile(file);
    if (file.endsWith('sw.js'))
      body = Buffer.concat([
        body,
        Buffer.from(`\n// verification revision ${revision}\n`),
      ]);
    const mime =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
      }[extname(file)] ?? 'text/plain';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(4174, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch(
    process.env.FLIPCHART_BROWSER_PATH
      ? { executablePath: process.env.FLIPCHART_BROWSER_PATH }
      : {},
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/flipchart/');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  const rows = Array.from(
    { length: 250 },
    (_, i) =>
      `${new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10)},10,12,9,11,100`,
  );
  await page.getByLabel('CSV file').setInputFiles({
    name: 'update-preservation.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,open,high,low,close,volume\n' + rows.join('\n')),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('UPDATE');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('UTC');
  await page
    .getByRole('button', { name: 'Validate data', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Load imported data', exact: true })
    .click();
  await page.getByText('Calculation parameters', { exact: true }).click();
  await page.getByLabel('RSI period', { exact: true }).fill('7');
  await page
    .getByRole('button', { name: 'Apply parameters', exact: true })
    .click();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const registration = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return r.scope;
  });
  assert.equal(registration, 'http://127.0.0.1:4174/flipchart/');
  const manifest = await page.evaluate(
    async () =>
      await (
        await fetch(new URL('manifest.webmanifest', location.href))
      ).json(),
  );
  assert.equal(manifest.start_url, './');
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    }),
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('article', { name: 'RSI 7', exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /Offline/);
  const blocked = await page.evaluate(
    async () =>
      await fetch(new URL('index.html', location.href), {
        cache: 'no-store',
        headers: { Authorization: 'fixture-only' },
      })
        .then(() => false)
        .catch(() => true),
  );
  assert.equal(blocked, true);
  const queryBlocked = await page.evaluate(
    async () =>
      await fetch(new URL('index.html?apikey=fixture-only', location.href))
        .then(() => false)
        .catch(() => true),
  );
  assert.equal(queryBlocked, true);
  await context.setOffline(false);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
    window.dispatchEvent(new Event('online'));
  });
  await page.request.get('http://127.0.0.1:4174/__verification-bump');
  await page.evaluate(
    async () => await (await navigator.serviceWorker.ready).update(),
  );
  await page
    .getByRole('button', { name: 'Update and reload', exact: true })
    .waitFor();
  // A waiting update must not replace the active worker before the explicit action.
  assert.equal(
    await page.evaluate(
      async () =>
        (await navigator.serviceWorker.getRegistration()).waiting?.state,
    ),
    'installed',
  );
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.reload();
  await page
    .getByRole('button', { name: 'Update and reload', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Update and reload', exact: true })
    .click();
  await page.getByRole('article', { name: 'RSI 7', exact: true }).waitFor();
  await page.waitForFunction(
    async () => !(await navigator.serviceWorker.getRegistration()).waiting,
  );
  assert.match(await page.locator('body').innerText(), /UPDATE/);
  assert.match(
    await page.getByRole('region', { name: 'Price workspace' }).innerText(),
    /Imported daily candles/,
  );
  const keys = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    return urls;
  });
  assert(keys.length > 0);
  assert(
    keys.every(
      (url) =>
        url.startsWith('http://127.0.0.1:4174/flipchart/') &&
        !url.includes('apikey') &&
        !url.includes('fixture-only'),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    'Subpath static host, offline reopen, authenticated/query bypass, controlled waiting update, and retained dataset/parameters: passed.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
