# Development Misc

## Useful Commands

- Format all supported files: `npm run format`
- Validate formatting: `npm run format:check`
- Full lint: `npm run lint`
- UI store boundary guardrail: `npm run check:ui:store-boundaries`
- UI theme contrast guardrail: `npm run check:ui:theme-contrast`
- UI i18n parity guardrail: `npm run check:ui:i18n-parity`
- TS source debt guardrail: `npm run check:ts:debt`
- TS source artifact guardrail: `npm run check:ts:source-artifacts`
- UI bundle budget guardrail (warn-first): `npm run check:ui:bundle-budget`
- UI lint only: `npm run lint:ui`
- API lint only: `npm run lint:api`
- Build UI: `npm run build:ui`
- Build shared runtime package: `npm run build:shared`
- Build UI + print bundle metrics baseline: `npm run build:ui:analyze`
- Print bundle metrics for an existing build: `npm run build:ui:metrics`
- Run API tests: `npm run test:api`
- Run UI runtime tests: `npm run test:ui`
- Run all tests: `npm run test`
- Run TypeScript type checks: `npm run typecheck`
- Verify docs pipeline (generate + stage): `npm run docs:verify`
- Verify build/syntax: `npm run build:verify`
- Full local CI pass: `npm run ci`
- Start realtime fixture stack: `npm run demo:realtime:up`
- Stop realtime fixture stack: `npm run demo:realtime:down`
- Realtime fixture smoke test: `npm run demo:realtime:smoke`
- Realtime integration loop (up + smoke + down): `npm run test:realtime:integration`
- Browser E2E smoke flow (bootstraps mongo + ui/api/gateway + Playwright): `npm run test:e2e:smoke`
- Production dependency audit: `npm run security:audit:prod`
- Full dependency audit (including dev/build tooling): `npm run security:audit:all`

## Pre-PR Checklist

Run this sequence before opening a PR:

```bash
npm run format:check
npm run lint
npm run check:ui:store-boundaries
npm run check:ui:theme-contrast
npm run check:ui:i18n-parity
npm run check:ts:debt
npm run check:ts:source-artifacts
npm run check:runtime-deps
npm run test
npm run build:verify
npm run typecheck
```

For changes touching `packages/ui/**`, `packages/api/**`, `packages/gateway/**`, `packages/shared/**`, or `e2e/**`, also run:

```bash
npm run test:e2e:smoke
```

If your change is docs-only, run `npm run format:check` to verify Markdown/YAML formatting consistency.

## CI Troubleshooting (Quick)

- If `Required CI` fails, open the `CI` workflow run and inspect the failing gated job (`format`, `lint`, `test-api`, `test-shared`, `test-ui`, `test-gateway`, `test-e2e-smoke`, `build-verify`, `docker-sanity`, `typecheck`).
- If lint fails on `Validate UI store boundaries`, remove `stores/freeboard` references and keep store imports out of `packages/ui/src/models/*` and `packages/ui/src/datasources/*`.
- If `Validate TS source debt` fails, remove unsafe TS patterns (`as any`, `as unknown as`, `: any`, `Record<string, any>`, `[key: string]: any`, `@ts-ignore`, `@ts-nocheck`) from `packages/*/src`.
- If `Validate UI theme contrast` fails, update theme token values in `packages/ui/src/assets/css/themes/*.css` so critical foreground/background token pairs meet the script threshold.
- If `Validate UI i18n parity` fails, align locale keys/placeholders to `packages/ui/src/i18n/locales/en.ts`.
- If `Validate TS source artifacts` fails, remove legacy JS source files from `packages/*/src`.
- If a job was expected but appears skipped, check `Classify changes` output in the `changes` job.
- If Docker publish unexpectedly rebuilds all images, verify event type:
  - `workflow_dispatch` intentionally rebuilds all packages.
  - push events use diff-based per-package skip logic.
- If Pages deploy did not run, verify changed files matched Pages workflow `paths` filters.

## Security Guardrail Coverage in CI

- Required branch gate remains `Required CI` from `.github/workflows/ci.yml`.
- `lint` job enforces runtime eval bans through ESLint (`no-eval`, `no-new-func`, `no-implied-eval`), `npm run check:ts:debt`, and runtime dependency hygiene (`npm run check:runtime-deps`).
- `test-shared` job validates shared runtime policy/client-IP utility behavior for `packages/shared` and shared-surface changes.
- `test-ui` job runs behavior-based UI regression tests (including layout policy behavior checks).
- `test-e2e-smoke` job in `CI` runs cross-service browser assertions from `e2e/smoke.spec.js` on relevant API, UI, gateway, `packages/shared`, and e2e changes and is included in `Required CI`.
- `docker-sanity` job validates API/gateway/UI Docker builds on Dockerfile/runtime dependency changes.
- Standalone `E2E smoke` workflow remains available for manual reruns (`workflow_dispatch`) and artifact triage.

## CI Workflow Matrix

| Workflow                                                                      | Trigger                                                          | Heavy-work cancellation                 | Notes                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| `CI` (`.github/workflows/ci.yml`)                                             | `pull_request` to `main`, `merge_group`, `workflow_dispatch`     | Yes (`concurrency: ci-<pr/ref>`)        | Required gate via `Required CI` job; path-gated jobs           |
| `E2E smoke` (`.github/workflows/e2e-smoke.yml`)                               | `workflow_dispatch`                                              | Yes (`concurrency: e2e-smoke-<pr/ref>`) | Manual browser smoke rerun with Playwright artifacts           |
| `Deploy to GitHub Pages` (`.github/workflows/build-pages.yml`)                | `push` to `main` on docs/demo-related paths, `workflow_dispatch` | Yes (`concurrency: pages-<ref>`)        | Builds docs + demo site                                        |
| `Build & publish docker images` (`.github/workflows/build-docker-images.yml`) | `push` to `main`, `workflow_dispatch`                            | No (intentional)                        | Per-package diff skip; manual dispatch forces full rebuild     |
| `Dependency security audit` (`.github/workflows/dependency-security.yml`)     | Weekly schedule + manual dispatch                                | N/A                                     | Fails on production dependency vulnerabilities (high/critical) |

## CI Runtime Budget (Targets)

- `CI` docs-only PR: under 5 minutes
- `CI` code PR (lint + selective tests + build verify + path-gated e2e smoke): under 30 minutes
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

## Dependency and Security Triage Policy

- Owners: repository maintainers.
- Intake channels:
  - Dependabot PRs (`.github/dependabot.yml`)
  - scheduled audit workflow (`.github/workflows/dependency-security.yml`)
- Triage SLA:
  - critical: same day
  - high: within 2 business days
  - moderate/low: batch in normal dependency maintenance windows
- Patch policy:
  - prefer grouped minor/patch updates first
  - major updates require focused validation (lint, test, build, and smoke checks)
  - never use `npm audit fix --force` in this repository; use targeted upgrades and explicit review
- Closure criteria:
  - dependency PR merged or explicitly deferred with rationale in PR notes
  - failed audit workflow resolved or acknowledged with a bounded remediation plan

## Mongo Dev Helpers

- Start Mongo only: `npm run dev:mongo:up`
- View Mongo status: `npm run dev:mongo:status`
- Tail Mongo logs: `npm run dev:mongo:logs`
- Stop Mongo: `npm run dev:mongo:down`
- Reset Mongo data volume: `npm run dev:mongo:reset`

Raspberry Pi note:

- Use `.env.pi` as your compose override baseline when needed.
- Reference support/risk details in [Raspberry Pi MongoDB Guidance](/manual/raspberry-pi-mongodb).

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

## UI Build Baseline

Use this when validating bundle and build-shape changes:

```bash
npm run build:ui:analyze
```

This prints:

- total emitted UI asset size
- total JS and CSS size
- top 10 largest assets and top 10 largest JS assets

Run it before and after bundle/loading architecture changes to compare impact with the same command.

## UI Bundle Budget Guardrail

`npm run check:ui:bundle-budget` runs after UI builds in `npm run build:verify`.

- Default behavior: warning-only (does not fail CI).
- Enforced mode (opt-in): set `FREEBOARD_ENFORCE_UI_BUNDLE_BUDGET=1` to fail only on core-route budget regressions.
- Optional editor payload (Monaco/workers) is tracked and reported separately as warn-only so it does not mask core app health signals.
- Budget thresholds live in `packages/ui/build-budget.json` and should be changed only when accompanied by fresh `npm run build:ui:analyze` baseline evidence.

## Theme System Rules

- Canonical dashboard theme options are `auto`, `light`, `paper`, `dark`, `slate`, `high-contrast`, `colorblind`, `amber-night`.
- Theme runtime is centralized through document-root attributes (`data-theme-selection`, `data-theme`); do not reintroduce route-local theme application.
- Settings dialog uses live preview semantics:
  - preview on selection change
  - rollback on dialog cancel/close
  - persistence only after dashboard `Save`/`Update`
- Keep theme metadata single-sourced in `packages/ui/src/ui/themeCatalog.ts`; do not duplicate theme swatches/labels in component-local constants.
- Use semantic tokens for themed surfaces/states (`--bg-*`, `--text-*`, `--status-*`, `--chart-*`); avoid hardcoded color literals in themeable UI paths.

## Theme Change Checklist

- Update `DASHBOARD_THEME_PRESETS` and `DASHBOARD_THEME_CATALOG` together.
- Confirm settings option labels and preview cards come only from `themeCatalog.ts`.
- Run `npm run check:ui:theme-contrast`.
- Run `npm run check:ui:i18n-parity` when changing user-facing UI copy or locale files.
- Verify live preview/cancel/apply behavior in Settings dialog.
- Run `npm run test:ui` and `npm run test:e2e:smoke`.
