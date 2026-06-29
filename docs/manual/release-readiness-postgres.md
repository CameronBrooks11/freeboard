# PostgreSQL Release Readiness Checklist

Use this runbook for final release hardening when PostgreSQL is the active datastore path.

## Scope

- validates schema migration safety
- validates API/UI/gateway/runtime quality gates
- validates Postgres datastore behavior gate in CI and local runs
- confirms security and operations runbook coverage before release cut

## Preconditions

1. Postgres is reachable from the execution environment.
2. `DATABASE_URL` or `FREEBOARD_POSTGRES_URL` is set.
3. `DB_BACKEND=postgres`.
4. `SECURITY_LIMITER_BACKEND` is either:
   - `postgres` (recommended for release checks)
   - `memory` (local-only troubleshooting mode)

## Full Validation Matrix

Primary command (runs the full release-readiness matrix):

```bash
npm run check:release
```

Optional (skip browser smoke temporarily):

```bash
npm run check:release -- --skip-e2e
```

E2E bootstrap port behavior:

1. `check:release` bootstraps a disposable Postgres compose container by default for the full matrix (including schema checks), then shuts it down at the end.
2. The disposable container uses host port `55432` by default to avoid collisions with local/staging Postgres already using `5432`.
3. Override port with `CHECK_RELEASE_E2E_POSTGRES_PORT=<port>` when needed.
4. Disable automatic bootstrap only if you intentionally want an external DB:
   - `CHECK_RELEASE_BOOTSTRAP_POSTGRES=0`
   - or `npm run check:release -- --no-bootstrap-postgres`

Equivalent manual command set:

```bash
npm run check:db:ready:strict
npm run db:schema:status
npm run db:schema:apply
npm run db:schema:status
npm run format:check
npm run lint
npm run check:ts:debt
npm run check:ts:source-artifacts
npm run test:shared
npm run test:api
npm run test:api:smoke
npm run test:ui
npm run test:gateway
npm run test:e2e:smoke
npm run build:verify
npm run typecheck
npm run db:schema:status
```

## Security and Ops Runbook Pass

Before signoff, verify the following runbooks are current and validated for the target environment:

1. [Secrets Operations Runbook](/manual/secrets-operations)
2. [Security Controls Rollout Runbook](/manual/security-controls-rollout)
3. [Credential Key Rotation](/manual/credential-key-rotation)
4. [Realtime Operations Runbook](/manual/realtime-operations)
5. [Installation](/manual/installation) and [Usage](/manual/usage)

Minimum explicit checks:

1. `SECURITY_LIMITER_BACKEND` matches `DB_BACKEND` for non-development runtime.
2. `SECURITY_LIMITER_FAILURE_MODE=fail-closed` and `REALTIME_LIMITER_FAILURE_MODE=fail-closed` unless a temporary degraded-mode change is approved.
3. bootstrap admin flow is disabled after first login (`CREATE_ADMIN=false`).
4. Postgres credentials and application secrets are non-default.

## Signoff Record Template

Record completion evidence in your release notes/change log:

1. validation matrix run ID and timestamp
2. CI run URL with passing required jobs
3. schema status output (pre/post)
4. runbook owner signoff (engineering + operations)
