# Debugging Workflow

Use this workflow when you want fast visibility into the app without setting up native automation first.

## Web lane

Use the web build as the primary shared inspection surface.

### Visual regression and dashboard checks

```powershell
pnpm --filter @workspace/mobile run test:visual
```

This path:

- starts Expo web
- seeds deterministic app state
- captures Playwright artifacts on failures
- sends Applitools checkpoints for major routes

### One-off seeded route inspection

Capture a screenshot of a seeded route without running the full Applitools suite:

```powershell
pnpm --filter @workspace/mobile run test:inspect -- --preset=progress
```

Available presets:

- `home`
- `builder`
- `calendar`
- `progress`
- `heatmap`
- `program`
- `workout`

Custom route example:

```powershell
pnpm --filter @workspace/mobile run test:inspect -- --route=/calendar --screen=calendar-screen --ready=Calendar --name=calendar-check
```

Headed browser example:

```powershell
pnpm --filter @workspace/mobile run test:inspect -- --preset=builder --headed
```

Screenshots are written to:

- [test-results/inspect](/D:/Workout-Volume/Workout-Volume/Workout-Volume/artifacts/mobile/test-results/inspect)

## Native lane

Use screenshots, short recordings, and logs for native-only issues in Expo Go or a simulator.

### Best artifacts by issue type

- layout/text issue: screenshot
- gesture/animation/navigation/timing issue: short screen recording
- crash/warning/runtime issue: logs plus screenshot or recording

### Native bug report bundle

Include:

- platform and device
- screen or route
- expected behavior
- actual behavior
- whether it reproduces on web, native, or both
- screenshot or recording
- logs if available

If a screenshot is already on disk, send the absolute file path so it can be opened directly.

## Recommended triage order

1. Try to reproduce on web.
2. If it reproduces, inspect with Playwright and optionally Applitools.
3. If it does not reproduce on web, gather native screenshot or recording plus logs.
4. Escalate to native automation later only if native-only issues become frequent.
