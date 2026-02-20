# Security Controls Rollout Runbook

Use this runbook for security-control deployments and incident rollback. It keeps trusted client identity and limiter behavior consistent across proxy, API, and gateway.

## Scope

- trusted client IP derivation (`API_TRUST_PROXY_HOPS`, `REALTIME_TRUST_PROXY_HOPS`)
- limiter backend dependency and failure behavior
- staged rollout and rollback for proxy/API/gateway
- canary watchlist during and after deploy

## Baseline Requirements

- Edge/reverse proxy must overwrite forwarded client identity headers:
  - `X-Forwarded-For` must be set to the authoritative remote client IP value, not appended with inbound untrusted chains.
  - `X-Forwarded-Proto` must match upstream scheme.
  - `X-Real-IP` should be set from the upstream client socket value.
- API and gateway trust hop values must be aligned for the same topology:
  - `API_TRUST_PROXY_HOPS=<n>`
  - `REALTIME_TRUST_PROXY_HOPS=<n>`
- In non-dev runtime, API security limiter backend must be shared Mongo state:
  - `SECURITY_LIMITER_BACKEND=mongo`
- Failure-mode defaults for non-dev runtime:
  - `SECURITY_LIMITER_FAILURE_MODE=fail-closed`
  - `REALTIME_LIMITER_FAILURE_MODE=fail-closed`

## Trust-Hop Quick Reference

- Direct service access, no trusted reverse proxy: set hops to `0`.
- One trusted reverse proxy in front of API/gateway: set hops to `1`.
- Two trusted proxy layers (for example CDN + edge reverse proxy): set hops to `2`.

If topology is uncertain, keep hops at `0` until the proxy chain is verified. Wrong hop counts can over-throttle or under-throttle.

## Limiter Dependency and Degraded-Mode Expectations

Default non-dev behavior is fail-closed.

- API limiter backend unavailable:
  - login attempts return temporary-unavailable failures.
  - datasource token mint and internal gateway limiter calls return `503`.
- Gateway realtime limiter unavailable:
  - realtime connect and public subscribe limits return `503` responses.
- `fail-open` is temporary degraded mode only, requires explicit change control, and must be reverted back to fail-closed after recovery.

Monitor limiter outcomes in runtime metrics:

- API: `limiter allow/reject/backend-error/fail-open/fail-closed`
- Gateway: `realtime limiter allow/reject/backend-error/fail-open/fail-closed`

## Staged Rollout Order

### 1. Proxy layer

- deploy header policy that overwrites forwarded identity values.
- verify websocket upgrade forwarding still works for `/gateway/realtime`.

### 2. API

- deploy with finalized `API_TRUST_PROXY_HOPS`.
- confirm `SECURITY_LIMITER_BACKEND=mongo`.
- confirm `SECURITY_LIMITER_FAILURE_MODE=fail-closed` (unless approved temporary degraded run).

### 3. Gateway

- deploy with matching `REALTIME_TRUST_PROXY_HOPS`.
- confirm `REALTIME_LIMITER_FAILURE_MODE=fail-closed` (unless approved temporary degraded run).
- confirm gateway can still call API internal endpoints:
  - `/internal/gateway/datasource-introspect`
  - `/internal/gateway/revoked-tokens`
  - `/internal/gateway/rate-limit/consume`

### 4. Canary validation

- validate login, datasource token mint, realtime connect/subscribe.
- review runtime metrics and logs for limiter backend errors or trust-hop warnings.

## Canary Metrics Watchlist

Watch during rollout canary and first steady-state window:

- API auth failure spikes beyond expected baseline.
- API limiter backend-error/fail-closed counters increasing.
- Gateway realtime limiter backend-error/fail-closed counters increasing.
- Realtime connection rejected spikes (`429`/`503`) not explained by expected load.
- Request latency regressions on API and gateway internal endpoints.

Also watch logs for warnings:

- `Security limiter warning: ...`
- `trust proxy hops configured but X-Forwarded-For is missing/invalid...`
- `X-Forwarded-For has fewer entries than configured trust proxy hops...`

## Rollback Procedure

Use rollback when canary metrics or customer-facing behavior indicates trust/limiter regression.

### 1. Roll back gateway release

- restore prior known-good gateway image/config.
- verify realtime connect/subscribe recovers.

### 2. Roll back API release

- restore prior known-good API image/config.
- verify login + datasource mint + internal limiter endpoint behavior.

### 3. Roll back proxy/header policy

- restore prior known-good proxy config.
- re-check trusted client IP derivation and websocket upgrade path.

### 4. Restore secure defaults

- if temporary degraded mode was used, set:
  - `SECURITY_LIMITER_FAILURE_MODE=fail-closed`
  - `REALTIME_LIMITER_FAILURE_MODE=fail-closed`
- rerun canary checks before declaring incident closed.

## Required Validation Before Closeout

Run this minimum command set after rollout/rollback verification:

```bash
npm run lint
npm run check:ts:debt
npm run test:api
npm run test:gateway
npm run test:ui
npm run test:e2e:smoke
npm run ci
```
