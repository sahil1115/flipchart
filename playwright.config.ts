import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.FLIPCHART_TEST_PORT ?? 4179);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL,

    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.FLIPCHART_BROWSER_PATH
          ? { executablePath: process.env.FLIPCHART_BROWSER_PATH }
          : {},
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: process.env.FLIPCHART_FIREFOX_PATH
          ? { executablePath: process.env.FLIPCHART_FIREFOX_PATH }
          : {},
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `node scripts/vite.mjs preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
