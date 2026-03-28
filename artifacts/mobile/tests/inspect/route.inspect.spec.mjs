import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { autoAcceptDialogs, installVisualBootstrap, waitForScreen } from '../visual/shared.mjs';

test('inspect seeded route', async ({ page }, testInfo) => {
  const route = process.env.INSPECT_ROUTE || '/';
  const screenId = process.env.INSPECT_SCREEN_ID || 'home-screen';
  const readyText = process.env.INSPECT_READY_TEXT || 'TRAINING LOG';
  const screenshotName = process.env.INSPECT_SCREENSHOT_NAME || 'inspect-route';

  await autoAcceptDialogs(page);
  await installVisualBootstrap(page);

  await page.goto(route);
  await waitForScreen(page, screenId);
  await expect(page.getByTestId(screenId).getByText(readyText)).toBeVisible();

  const outputDir = path.resolve(process.cwd(), 'test-results', 'inspect');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, `${screenshotName}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('inspect-screenshot', {
    path: screenshotPath,
    contentType: 'image/png',
  });
});
