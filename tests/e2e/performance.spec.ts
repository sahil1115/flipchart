import { expect, test } from '@playwright/test';
import { cpus, platform, release } from 'node:os';
import { writeFileSync } from 'node:fs';
test('production profile: 5,000 varied candles and typical panels', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const rows = Array.from({ length: 5000 }, (_, i) => {
    const close = 100 + i / 100 + Math.sin(i / 7) * 4;
    return `${new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10)},${close - 1},${close + 2},${close - 2},${close},${10000 + i}`;
  });
  await page.getByRole('button', { name: /Import CSV/ }).click();
  await page.getByLabel('CSV file').setInputFiles({
    name: 'profile.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('date,open,high,low,close,volume\n' + rows.join('\n')),
  });
  await page.getByLabel('Listing symbol', { exact: true }).fill('PROFILE');
  await page.getByLabel('Currency', { exact: true }).fill('USD');
  await page.getByLabel('Exchange timezone', { exact: true }).fill('UTC');
  const timings: Record<string, number> = {};
  const timed = async (name: string, action: () => Promise<void>) => {
    const begin = await page.evaluate(() => performance.now());
    await action();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    timings[name] = (await page.evaluate(() => performance.now())) - begin;
  };
  await timed('validateAndLoadMs', async () => {
    await page
      .getByRole('button', { name: 'Validate data', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Load imported data', exact: true })
      .click();
    await expect(
      page.getByTestId('price-chart').locator('canvas').first(),
    ).toBeVisible();
    await expect(
      page.getByRole('article', { name: 'SMA', exact: true }),
    ).not.toContainText('Unavailable');
  });
  await page.getByText('Calculation parameters', { exact: true }).click();
  await page.getByLabel('RSI period', { exact: true }).fill('7');
  await timed('parameterApplyMs', async () => {
    await page
      .getByRole('button', { name: 'Apply parameters', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'RSI 7', exact: true }),
    ).toBeVisible();
  });
  await timed('rangeChangeMs', async () => {
    await page.getByRole('button', { name: '1M', exact: true }).click();
  });
  const chart = page.getByTestId('price-chart');
  await chart.scrollIntoViewIfNeeded();
  const bounds = await chart.boundingBox();
  expect(bounds).not.toBeNull();
  await timed('panMs', async () => {
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 100);
    await page.mouse.down();
    await page.mouse.move(
      bounds!.x + bounds!.width / 2 + 100,
      bounds!.y + 100,
      { steps: 5 },
    );
    await page.mouse.up();
  });
  await timed('zoomMs', async () => {
    await page.mouse.wheel(0, -200);
  });
  await timed('exportMs', async () => {
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Download CSV', exact: true })
      .click();
    await (await download).path();
    await expect(
      page.getByRole('status').filter({ hasText: 'Exported 5000' }),
    ).toBeVisible();
  });
  const renderSamples: Array<{
    durationMs: number;
    longTasksMs: number[];
    longTaskSupported: boolean;
  }> = [];
  for (const period of [10, 11, 12]) {
    await page.getByLabel('RSI period', { exact: true }).fill(String(period));
    renderSamples.push(
      await page.evaluate(async () => {
        const longTaskSupported =
          PerformanceObserver.supportedEntryTypes.includes('longtask');
        const longTasksMs: number[] = [];
        const observer = new PerformanceObserver((list) =>
          longTasksMs.push(...list.getEntries().map((entry) => entry.duration)),
        );
        if (longTaskSupported) observer.observe({ type: 'longtask' });
        const begin = performance.now();
        (
          Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === 'Apply parameters',
          ) as HTMLButtonElement
        ).click();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        observer.disconnect();
        return {
          durationMs: performance.now() - begin,
          longTasksMs,
          longTaskSupported,
        };
      }),
    );
    await expect(
      page.getByRole('article', { name: `RSI ${period}`, exact: true }),
    ).toBeVisible();
  }
  const measurements = {
    candles: 5000,
    panels: 'Price/SMA, volume/SMA, RSI, MACD, ATR',
    engine: info.project.name,
    browser: page.context().browser()!.version(),
    os: platform(),
    osRelease: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    viewport: page.viewportSize(),
    timings,
    parameterRenderSamples: renderSamples,
    method:
      'Production preview; browser performance.now intervals include Playwright actionability and two animation frames. Three additional direct DOM parameter clicks measure processing plus two frames without driver actionability. Long Task API recorded only where supported. Unthrottled observations, not benchmarks.',
  };
  writeFileSync(
    info.outputPath('release-profile.json'),
    JSON.stringify(measurements, null, 2),
  );
  console.log('Release profile:', JSON.stringify(measurements));
  expect(errors).toEqual([]);
});
