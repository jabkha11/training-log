import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { autoAcceptDialogs, installVisualBootstrap, waitForScreen, waitForSeededWorkoutState } from './shared.mjs';

const authDir = path.resolve(process.cwd(), 'playwright/.auth');
const storageStatePath = path.join(authDir, 'visual-seeded.json');

test('seed deterministic visual state', async ({ page, context }) => {
  fs.mkdirSync(authDir, { recursive: true });

  await autoAcceptDialogs(page);
  await installVisualBootstrap(page);

  await page.goto('/');
  await waitForScreen(page, 'home-screen');
  await expect(page.getByText('TRAINING LOG')).toBeVisible();

  await page.getByTestId('home-dev-settings-button').click();
  await expect(page.getByTestId('home-dev-menu')).toBeVisible();
  await page.getByTestId('dev-seed-demo-button').click();

  await waitForSeededWorkoutState(page);
  await expect(page.getByText('Coaching Summary')).toBeVisible();

  await context.storageState({ path: storageStatePath });
});
