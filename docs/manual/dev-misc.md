# Development Misc

## Useful Commands

- Full lint: `npm run lint`
- UI lint only: `npm run lint:ui`
- API lint only: `npm run lint:api`
- Build UI: `npm run build:ui`
- Run API tests: `npm run test:api`
- Run UI runtime tests: `npm run test:ui`
- Run all tests: `npm run test`
- Verify build/syntax: `npm run build:verify`
- Full local CI pass: `npm run ci`

## Pre-PR Checklist

Run this sequence before opening a PR:

```bash
npm run lint
npm run test
npm run build:verify
```

If your change is docs-only, still run `npm run lint` to catch formatting or syntax issues in touched JS/YAML files.

## CI Troubleshooting (Quick)

- If `Required CI` fails, open the `CI` workflow run and inspect the failing gated job (`lint`, `test-api`, `test-ui`, `build-verify`).
- If a job was expected but appears skipped, check `Classify changes` output in the `changes` job.
- If Docker publish unexpectedly rebuilds all images, verify event type:
  - `workflow_dispatch` intentionally rebuilds all packages.
  - push events use diff-based per-package skip logic.
- If Pages deploy did not run, verify changed files matched Pages workflow `paths` filters.

## Mongo Dev Helpers

- Start Mongo only: `npm run dev:mongo:up`
- View Mongo status: `npm run dev:mongo:status`
- Tail Mongo logs: `npm run dev:mongo:logs`
- Stop Mongo: `npm run dev:mongo:down`
- Reset Mongo data volume: `npm run dev:mongo:reset`

## Quick Size Snapshot (`cloc`)

Install:

```bash
npm install -g cloc
```

Run against tracked files:

```bash
cloc --vcs=git
```

On Windows, prefer the standalone binary:

```powershell
winget install AlDanial.cloc
```
