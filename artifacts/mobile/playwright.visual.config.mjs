import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_WEB_PORT || 19007);
const baseURL = `http://127.0.0.1:${port}`;
const webServerCommand = process.platform === 'win32'
  ? `cmd /c "set CI=1&& pnpm exec expo start --web --localhost --port ${port}"`
  : `CI=1 pnpm exec expo start --web --localhost --port ${port}`;

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1440, height: 1200 },
    timezoneId: 'America/Chicago',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /visual\.setup\.mjs/,
    },
    {
      name: 'visual-chromium',
      dependencies: ['setup'],
      testIgnore: /visual\.setup\.mjs/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
        viewport: { width: 1440, height: 1200 },
        timezoneId: 'America/Chicago',
        storageState: 'playwright/.auth/visual-seeded.json',
      },
    },
  ],
});
