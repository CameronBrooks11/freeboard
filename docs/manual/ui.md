# Freeboard UI

## Overview

The UI is a Vue 3 SPA (`packages/ui`) that lets users:

- authenticate against GraphQL API
- configure datasources and widgets
- save/load dashboards
- render realtime dashboard data through gateway-backed datasource transports (`http`, `sse`, `websocket`, `mqtt`)

Core stack:

- Vue 3 + Vite
- Pinia
- Vue Router
- Apollo Client (+ GraphQL SSE)
- Monaco editor (code fields)

## Key Paths

- Entry/bootstrap: `packages/ui/src/main.js`
- Router: `packages/ui/src/router/index.js`
- Global store: `packages/ui/src/stores/freeboard.js`
- Models: `packages/ui/src/models/*`
- Datasources: `packages/ui/src/datasources/*`
- Widgets: `packages/ui/src/widgets/*`
- Runtime helpers: `packages/ui/src/widgets/runtime/*`
- Main shell: `packages/ui/src/components/Freeboard.vue`

## Runtime Behavior

1. UI authenticates and stores token in local storage.
2. Dashboard data is fetched from GraphQL.
3. Datasources emit updates:
   - GraphQL dashboard subscriptions use SSE.
   - Realtime datasource plugins share a dashboard-level `StreamingManager` socket to `/gateway/realtime`.
4. Dashboard snapshot is normalized.
5. Widget runtime resolves bindings/templates per widget.
6. Widget errors are isolated to avoid global dashboard failure.

See [Widget Runtime](/manual/widget-runtime) for lifecycle details.

## Important Config

- Vite dev proxy routes:
  - `/graphql` -> API (`localhost:4001`)
  - `/gateway` -> Gateway (`localhost:8001`)
- Static build mode:
  - `FREEBOARD_STATIC=1` and `FREEBOARD_BASE_PATH` for static deployments (e.g. GitHub Pages)

## Extension Points

- New datasources: `packages/ui/src/datasources/`
- New widgets: `packages/ui/src/widgets/`

User-facing docs:

- [Datasource Reference](/manual/datasource-reference)
- [Widget Reference](/manual/widget-reference)
- [Widget Examples](/manual/widget-examples/)
- [Base Widget Guide](/manual/widget-base-guide)

## Developer Commands

```bash
npm run dev --workspace=packages/ui
npm run build --workspace=packages/ui
npm run lint:ui
npm run test:ui
```

UI runtime tests live in `packages/ui/test/*.test.js` and target binding resolution, plugin validation, and reactive widget runtime behavior.

## Component/API References

For full generated references:

- UI component docs: `/dev/components/`
- API JSDoc: `/dev/api/`
- GraphQL schema: `/dev/graphql/`
