# Architecture

Freeboard is a monorepo with three runtime services and one shared data store.

## Services

- UI (`packages/ui`): Vue 3 + Vite SPA
- API (`packages/api`): GraphQL Yoga + Mongoose
- Proxy (`packages/proxy`): HTTP fetch proxy for CORS-restricted upstreams
- MongoDB: persistence for users and dashboards

## Runtime Data Flow

1. UI authenticates with API (`/graphql`) and stores JWT token in local storage.
2. UI queries/mutates dashboards through GraphQL.
3. API persists dashboards/users in MongoDB.
4. Datasource plugins in UI produce updates.
5. Dashboard model normalizes datasource state and pushes updates to widgets.

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

- `Dashboard` (`packages/ui/src/models/Dashboard.js`)
  - owns panes, datasources, auth providers
  - handles serialization/deserialization
  - propagates datasource updates to widgets
- `Datasource` (`packages/ui/src/models/Datasource.js`)
  - owns datasource plugin instance and update lifecycle
- `Widget` (`packages/ui/src/models/Widget.js`)
  - owns widget plugin instance, rendering, errors, and resize forwarding

## Ports (Default Dev)

- UI: `5173`
- API: `4001`
- Proxy: `8001`
- MongoDB: `27017`

## Configuration

Core env values:

- `MONGO_URL` (API local development)
- `FREEBOARD_MONGO_URL` (containerized API)
- `PORT` (API/proxy workspace process port)
- `FREEBOARD_MONGO_IMAGE` (Mongo image tag for dev compose)
- `FREEBOARD_STATIC` (static UI build mode; only enable for static deploy builds)
- `FREEBOARD_RUNTIME_ENV` (`production` for containerized runtime defaults)
- `JWT_SECRET` (required for containerized API startup)
- `PROXY_ALLOWED_HOSTS` (required for containerized proxy startup)

## Security Defaults

- API and Proxy are hardened for production behavior when `NODE_ENV=production`.
- Container artifacts default to production mode.
- Docker Compose startup is fail-fast for missing critical env:
  - API requires `JWT_SECRET`
  - Proxy requires `PROXY_ALLOWED_HOSTS`

## CI Topology

- Required PR workflow: `.github/workflows/ci.yml`
  - Jobs: `changes` -> conditional `lint`, `test-api`, `test-ui`, `build-verify` -> always-run `Required CI`.
  - Concurrency: cancels superseded PR runs using PR-number/ref keyed group.
  - Required check target for branch protection: `Required CI`.
- Pages workflow: `.github/workflows/build-pages.yml`
  - Runs only on docs/demo-relevant path changes on `dev`.
  - Concurrency cancellation enabled per ref.
- Docker publish workflow: `.github/workflows/build-docker-images.yml`
  - Runs on push to `dev` and manual dispatch.
  - Per-package diff detection skips unchanged matrix entries.
  - Manual dispatch forces full rebuild intentionally.
  - Concurrency cancellation is intentionally disabled to avoid skipped publishes on rapid sequential pushes.
