# Architecture

Freeboard is a monorepo with three runtime services and one shared data store.

## Services

- UI (`packages/ui`): Vue 3 + Vite SPA
- API (`packages/api`): GraphQL Yoga + datastore repositories
- Gateway (`packages/gateway`): datasource execution boundary for HTTP + realtime protocols
- PostgreSQL: persistence for users and dashboards

## Runtime Data Flow

1. UI authenticates with API (`/graphql`) and stores JWT token in local storage.
2. UI queries/mutates dashboards through GraphQL.
3. API persists dashboards/users in PostgreSQL.
4. UI mints short-lived datasource session tokens from API.
5. Datasource runtimes execute through gateway:
   - HTTP polling via `POST /gateway/http/fetch`
   - Realtime streams via `GET /gateway/realtime` (single dashboard-level WebSocket transport)
6. Gateway validates token, introspects canonical intent from API, enforces egress policy, then connects upstream.
7. For public/link streams, gateway applies revocation polling + periodic full revalidation to cut stale access.
8. Dashboard model normalizes datasource state and pushes updates to widgets.

## Realtime Transport Model

Browser-facing transport:

- One gateway WebSocket per dashboard runtime.
- Multiplexed datasource subscriptions (`subscribe`/`unsubscribe` messages).
- Session-token refresh uses re-subscribe on the same datasource id.

Upstream adapters:

- SSE adapter (`sse`)
- WebSocket adapter (`websocket`)
- MQTT adapter (`mqtt`) with broker connection pooling and topic policy enforcement

Security boundaries:

- Browser never sends upstream secrets.
- Gateway resolves credential material from API introspection only.
- Public/link subscriptions require explicit public-use profile policy.
- Token expiry and share-token revocation are enforced server-side.

Channel sketch:

```text
UI Datasources (sse/websocket/mqtt)
  -> StreamingManager (1 WS per dashboard)
  -> Gateway /gateway/realtime
  -> API /internal/gateway/datasource-introspect
  -> Upstream SSE/WS/MQTT target

Public/link revoke path:
API share-token revocation feed
  -> Gateway polling + full revalidation
  -> stale public subscriptions disconnected
```

## Widget Runtime Flow

1. Widget plugins are registered in `Freeboard.vue`.
2. Widget model instantiates plugin via `newInstance(settings, callback)`.
3. Dashboard builds normalized snapshot:
   - `datasources.<id>`
   - `datasourceTitles.<title> -> id`
4. Widget runtime resolves bindings/templates against snapshot.
5. Widget updates are isolated; runtime errors are captured per widget.
6. Pane layout enforces minimum height from widget preferred rows.

See: [Widget Runtime](/manual/widget-runtime)

## Key UI Models

- `Dashboard` (`packages/ui/src/models/Dashboard.ts`)
  - owns panes and datasources
  - handles serialization/deserialization
  - propagates datasource updates to widgets
- `Datasource` (`packages/ui/src/models/Datasource.ts`)
  - owns datasource plugin instance and update lifecycle
  - delegates realtime lifecycle to per-dashboard `StreamingManager` for `sse`/`websocket`/`mqtt`
- `Widget` (`packages/ui/src/models/Widget.ts`)
  - owns widget plugin instance, rendering, errors, and resize forwarding

## Ports (Default Dev)

- UI: `5173`
- API: `4001`
- Gateway: `8001`
- PostgreSQL: `5432`

## Configuration

Core env values:

- `DB_BACKEND` (`postgres` for release path)
- `DATABASE_URL` (API local development)
- `FREEBOARD_POSTGRES_URL` (containerized API)
- `PORT` (API/gateway workspace process port)
- `FREEBOARD_POSTGRES_IMAGE` (Postgres image tag for dev compose)
- `FREEBOARD_UI_IMAGE_TAG` / `FREEBOARD_API_IMAGE_TAG` / `FREEBOARD_GATEWAY_IMAGE_TAG` (runtime service image tag pinning)
- `FREEBOARD_STATIC` (static UI build mode; only enable for static deploy builds)
- `FREEBOARD_RUNTIME_ENV` (`production` for containerized runtime defaults)
- `JWT_SECRET` (required for containerized API startup)
- `JWT_GATEWAY_SECRET` (required API+gateway datasource session signing key)
- `GATEWAY_SERVICE_TOKEN` (required gateway introspection auth token)
- `CREDENTIAL_ENCRYPTION_KEY` (required API credential profile encryption key)
- `EGRESS_ALLOWED_HOSTS` (required for containerized gateway startup)
- `API_TRUST_PROXY_HOPS` / `REALTIME_TRUST_PROXY_HOPS` (trusted reverse-proxy hop counts for client IP derivation)
- `SECURITY_LIMITER_BACKEND` / `SECURITY_LIMITER_FAILURE_MODE` / `SECURITY_LIMITER_NAMESPACE` (API shared limiter backend + fail policy)
- `REALTIME_LIMITER_FAILURE_MODE` / `GATEWAY_LIMITER_TIMEOUT_MS` (gateway realtime limiter outage behavior)
- `REALTIME_*` (required to tune realtime policy, limits, and protocol toggles)

Secret setup/rotation workflow is centralized in [Secrets Operations Runbook](/manual/secrets-operations).
Security control deployment/rollback workflow is centralized in [Security Controls Rollout Runbook](/manual/security-controls-rollout).

## Security Defaults

- API and gateway are hardened for non-development behavior when `NODE_ENV` is not `development`/`test`.
- Container artifacts default to production mode.
- Docker Compose startup is fail-fast for missing critical env:
  - API requires `FREEBOARD_POSTGRES_URL`
  - API requires `JWT_SECRET`
  - API requires `JWT_GATEWAY_SECRET`, `GATEWAY_SERVICE_TOKEN`, `CREDENTIAL_ENCRYPTION_KEY`
  - API security limiter defaults to Postgres-backed shared state in non-dev runtime
  - Gateway requires `EGRESS_ALLOWED_HOSTS`, `JWT_GATEWAY_SECRET`, `GATEWAY_SERVICE_TOKEN`
  - Gateway realtime policy defaults to enabled, with protocol toggles and per-IP/per-dashboard limits

## CI Topology

- Required PR workflow: `.github/workflows/ci.yml`
  - Jobs: `changes` -> conditional `format`, `lint`, `test-api`, `test-shared`, `test-ui`, `test-gateway`, `test-e2e-smoke`, `build-verify`, `docker-sanity`, `typecheck` -> always-run `Required CI`.
  - Concurrency: cancels superseded PR runs using PR-number/ref keyed group.
  - Required check target for branch protection: `Required CI`.
- Manual E2E rerun workflow: `.github/workflows/e2e-smoke.yml`
  - Trigger: `workflow_dispatch`
  - Purpose: ad-hoc Playwright smoke reruns and artifact collection outside required PR gating.
- Pages workflow: `.github/workflows/build-pages.yml`
  - Runs only on docs/demo-relevant path changes on `main`.
  - Concurrency cancellation enabled per ref.
- Docker publish workflow: `.github/workflows/build-docker-images.yml`
  - Runs on push to `main` and manual dispatch.
  - Per-package diff detection skips unchanged matrix entries while still rebuilding on shared dependency/lockfile changes.
  - Publishes `latest`, `v<workspace-version>`, and `sha-<short-commit>` tags per service image.
  - Emits OCI labels including source URL, git revision, and package-derived version.
  - Manual dispatch forces full rebuild intentionally.
  - Concurrency cancellation is intentionally disabled to avoid skipped publishes on rapid sequential pushes.
