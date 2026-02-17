# @freeboard/ui

Vue 3 single-page application for dashboard editing, playback, sharing, and admin operations.

## Local Commands

- `npm run dev --workspace=packages/ui`
- `npm run build --workspace=packages/ui`
- `npm run test:ui`
- `npm run lint:ui`

## Responsibilities

- Dashboard editor/player UX (`src/components`)
- Datasource runtime and streaming manager (`src/datasources`)
- Widget runtime and built-in widgets (`src/widgets`)
- Auth/admin state + stores (`src/stores`, `src/admin`)
- Router and app bootstrap (`src/router`, `src/bootstrap`, `src/main.js`)

## API/Gateway Integration

- GraphQL operations are defined in `src/gql.js`
- HTTP datasource sessions execute through gateway endpoints
- Realtime datasource subscriptions use dashboard-level websocket transport

## Important Local Config

Common local defaults come from root `.env`:

- `FREEBOARD_API_HOST` / `FREEBOARD_API_PORT`
- `FREEBOARD_GATEWAY_HOST` / `FREEBOARD_GATEWAY_PORT`
- `VITE_ALLOW_DIRECT_HTTP_DATASOURCE` (advanced local-only behavior)

## Notes for Contributors

- Keep UI state boundaries clear (stores vs component-local state).
- Prefer extracting composition/helpers over growing component/controller files.
- For widget/datasource changes, add tests under `packages/ui/test` covering runtime behavior.
