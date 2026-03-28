import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_WEB_PORT || 19008);
const baseURL = `http://127.0.0.1:${port}`;
const viewportWidth = Number(process.env.PLAYWRIGHT_VIEWPORT_WIDTH || 1440);
const viewportHeight = Number(process.env.PLAYWRIGHT_VIEWPORT_HEIGHT || 1200);
const webServerCommand = process.platform === 'win32'
  ? `cmd /c "set CI=1&& pnpm exec expo start --web --localhost --port ${port}"`
  : `CI=1 pnpm exec expo start --web --localhost --port ${port}`;

export default defineConfig({
  testDir: './tests/inspect',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ['list'],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: viewportWidth, height: viewportHeight },
    timezoneId: 'America/Chicago',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'retain-on-failure',
    headless: process.env.PLAYWRIGHT_HEADED === '1' ? false : true,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
