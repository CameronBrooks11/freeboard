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

## CI Workflow Matrix

| Workflow | Trigger | Heavy-work cancellation | Notes |
| --- | --- | --- | --- |
| `CI` (`.github/workflows/ci.yml`) | `pull_request` to `dev`, `merge_group`, `workflow_dispatch` | Yes (`concurrency: ci-<pr/ref>`) | Required gate via `Required CI` job; path-gated jobs |
| `Deploy to GitHub Pages` (`.github/workflows/build-pages.yml`) | `push` to `dev` on docs/demo-related paths, `workflow_dispatch` | Yes (`concurrency: pages-<ref>`) | Builds docs + demo site |
| `Build & publish docker images` (`.github/workflows/build-docker-images.yml`) | `push` to `dev`, `workflow_dispatch` | No (intentional) | Per-package diff skip; manual dispatch forces full rebuild |

## CI Runtime Budget (Targets)

- `CI` docs-only PR: under 5 minutes
- `CI` code PR (lint + selective tests + build verify): under 15 minutes
- `Deploy to GitHub Pages`: under 15 minutes for build job
- `Build & publish docker images`: under 90 minutes worst case (all images, multi-arch)

Treat these as operating targets. If runs consistently exceed budget, optimize path filters or split heavy work.

Note: Docker publish concurrency cancellation is intentionally disabled to prevent missed publishes when multiple commits land before earlier image builds finish.

## CI Ownership and Path-Filter Policy

- Owner: repository maintainers.
- Any change to workflow path filters must update:
  - `.github/workflows/ci.yml` (change classification)
  - `.github/workflows/build-pages.yml` (docs/demo trigger scope)
  - this doc section (so behavior remains explicit)
- Rule: prefer narrow path filters that match true build inputs; avoid broad globs that trigger expensive jobs for docs-only changes.

## Branch Protection Mapping

Use these required checks in branch protection:

- `Required CI` (from `.github/workflows/ci.yml`)

Optional non-required deploy checks:

- `Deploy to GitHub Pages`
- `Build & publish docker images`

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
