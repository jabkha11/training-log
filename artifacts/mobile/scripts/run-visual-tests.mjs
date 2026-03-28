import { spawn } from 'node:child_process';

const isUpdateRun = process.argv.includes('--update');

if (!process.env.APPLITOOLS_API_KEY) {
  console.error('APPLITOOLS_API_KEY is required for visual tests. Set it in your shell or CI secret before running `pnpm test:visual`.');
  process.exit(1);
}

const env = {
  ...process.env,
  CI: process.env.CI ?? '0',
};

if (!env.APPLITOOLS_BATCH_NAME) {
  env.APPLITOOLS_BATCH_NAME = isUpdateRun
    ? 'Training Log Visual Baseline Refresh'
    : 'Training Log Visual Checks';
}

const command = 'pnpm exec playwright test -c playwright.visual.config.mjs';

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', code => {
  process.exit(code ?? 1);
});
