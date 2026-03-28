import { expect } from '@playwright/test';
import { test } from '@applitools/eyes-playwright/fixture';
import { autoAcceptDialogs, installVisualBootstrap, waitForScreen } from './shared.mjs';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await autoAcceptDialogs(page);
  await installVisualBootstrap(page);
});

async function checkRoute({
  page,
  eyes,
  route,
  screenId,
  readyText,
  checkpoint,
  matchLevel,
}) {
  await page.goto(route);
  await waitForScreen(page, screenId);
  await expect(page.getByTestId(screenId).getByText(readyText)).toBeVisible();
  await eyes.check(checkpoint, {
    fully: true,
    matchLevel,
  });
}

test('visual - home', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/',
    screenId: 'home-screen',
    readyText: 'Coaching Summary',
    checkpoint: 'Home',
    matchLevel: 'Strict',
  });
});

test('visual - builder', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/builder',
    screenId: 'builder-screen',
    readyText: 'Program Builder',
    checkpoint: 'Builder',
    matchLevel: 'Strict',
  });
});

test('visual - calendar', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/calendar',
    screenId: 'calendar-screen',
    readyText: 'Calendar',
    checkpoint: 'Calendar',
    matchLevel: 'Strict',
  });
});

test('visual - progress', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/progress',
    screenId: 'progress-screen',
    readyText: 'Progress',
    checkpoint: 'Progress',
    matchLevel: 'Layout',
  });
});

test('visual - heatmap', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/volume',
    screenId: 'heatmap-screen',
    readyText: 'Heatmap',
    checkpoint: 'Heatmap',
    matchLevel: 'Layout',
  });
});

test('visual - program day editor', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/program/bootstrap-monday',
    screenId: 'program-day-editor-screen',
    readyText: 'Builder Day',
    checkpoint: 'Program Day Editor',
    matchLevel: 'Strict',
  });
});

test('visual - workout day', async ({ page, eyes }) => {
  await checkRoute({
    page,
    eyes,
    route: '/workout/bootstrap-monday',
    screenId: 'workout-screen',
    readyText: 'Push A',
    checkpoint: 'Workout Day',
    matchLevel: 'Strict',
  });
});
