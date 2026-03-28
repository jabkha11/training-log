# Visual Testing

This app uses Playwright plus Applitools Eyes for web visual regression coverage.

## Local setup

Set your Applitools key in PowerShell for the current session:

```powershell
$env:APPLITOOLS_API_KEY="your-key-here"
```

Or persist it for your user profile:

```powershell
[System.Environment]::SetEnvironmentVariable("APPLITOOLS_API_KEY", "your-key-here", "User")
```

Verify the key is available:

```powershell
echo $env:APPLITOOLS_API_KEY
```

Install Playwright's Chromium browser once:

```powershell
pnpm --filter @workspace/mobile exec playwright install chromium
```

Run the visual suite:

```powershell
pnpm --filter @workspace/mobile run test:visual
```

`test:visual:update` runs the same suite with a separate batch label for intentional baseline refresh work. Baseline approvals still happen in the Applitools dashboard.

## What the suite does

- Starts Expo web from [artifacts/mobile](/D:/Workout-Volume/Workout-Volume/Workout-Volume/artifacts/mobile)
- Seeds deterministic local app state through the existing dev-only seed flow
- Freezes the browser date for stable screenshots
- Seeds a local catalog snapshot to avoid live WGER sync noise
- Captures visual checkpoints for Home, Builder, Calendar, Progress, Heatmap, Program Day Editor, and Workout Day
- Produces standard Playwright traces, screenshots, and videos when a check fails

## GitHub Actions

Add `APPLITOOLS_API_KEY` as a repository secret, then use the `Visual Tests` workflow.

The first successful run will create baselines in Applitools. Review and approve those baselines in the Applitools dashboard before treating later diffs as regressions.

## Day-to-day inspection

For quick seeded route screenshots without running the full Applitools suite, use:

```powershell
pnpm --filter @workspace/mobile run test:inspect -- --preset=home
```

See [DEBUGGING_WORKFLOW.md](/D:/Workout-Volume/Workout-Volume/Workout-Volume/DEBUGGING_WORKFLOW.md) for the full web-vs-native debugging workflow.
