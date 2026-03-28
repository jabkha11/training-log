import { spawn } from 'node:child_process';

const ROUTE_PRESETS = {
  home: { route: '/', screenId: 'home-screen', readyText: 'Coaching Summary' },
  builder: { route: '/builder', screenId: 'builder-screen', readyText: 'One active plan. The rest are ready when you are.' },
  calendar: { route: '/calendar', screenId: 'calendar-screen', readyText: 'Training Calendar' },
  progress: { route: '/progress', screenId: 'progress-screen', readyText: 'Progress' },
  heatmap: { route: '/volume', screenId: 'heatmap-screen', readyText: 'Heatmap' },
  program: { route: '/program/bootstrap-monday', screenId: 'program-day-editor-screen', readyText: 'Program Day' },
  workout: { route: '/workout/bootstrap-monday', screenId: 'workout-screen', readyText: 'Push A' },
};

function readFlag(name) {
  const entry = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return entry ? entry.slice(name.length + 3) : null;
}

const presetKey = readFlag('preset');
const preset = presetKey ? ROUTE_PRESETS[presetKey] : null;
const route = readFlag('route') ?? preset?.route ?? '/';
const screenId = readFlag('screen') ?? preset?.screenId ?? 'home-screen';
const readyText = readFlag('ready') ?? preset?.readyText ?? 'TRAINING LOG';
const screenshotName = readFlag('name') ?? (presetKey || 'inspect-route');
const headed = process.argv.includes('--headed');

const env = {
  ...process.env,
  INSPECT_ROUTE: route,
  INSPECT_SCREEN_ID: screenId,
  INSPECT_READY_TEXT: readyText,
  INSPECT_SCREENSHOT_NAME: screenshotName,
  PLAYWRIGHT_HEADED: headed ? '1' : '0',
};

const child = spawn(
  'pnpm exec playwright test -c playwright.inspect.config.mjs',
  {
    stdio: 'inherit',
    shell: true,
    env,
  },
);

child.on('exit', code => {
  process.exit(code ?? 1);
});
