# Architecture

Freeboard is a monorepo providing a Vue frontend, a GraphQL API, a lightweight HTTP proxy, and MongoDB persistence.

## Components

- **UI (`packages/ui`)**  
  Vue 3 + Vite application. In dev it runs on port 5173; in Docker it’s served by Nginx.
- **API (`packages/api`)**  
  Node.js service exposing GraphQL (graphql-yoga) on port 4001. Uses Mongoose to persist users and dashboards in MongoDB. Publishes subscription events via an in-process PubSub.
- **Proxy (`packages/proxy`)**  
  Express service on port 8001 to fetch third-party URLs server-side and return them to the UI, avoiding browser CORS limits.
- **MongoDB**  
  Stores `users` and `dashboards` collections.

## Data Flow

1. UI authenticates and calls the GraphQL API (`/graphql`) for queries/mutations.
2. API reads/writes MongoDB via Mongoose.
3. UI subscribes to updates (GraphQL subscriptions) to live-refresh dashboards.
4. For external data that blocks on CORS, the UI requests through the Proxy (`/proxy?url=...`).

## Ports (default)

- UI: 5173 (dev), 8080 (container)
- API: 4001
- Proxy: 8001
- MongoDB: 27017

## Configuration

Key environment variables (see `.env`):

- `FREEBOARD_MONGO_URL` – Mongo connection string
- `FREEBOARD_ADMIN_EMAIL`, `FREEBOARD_ADMIN_PASSWORD` – bootstrap admin
- `VITE_API_URL` – UI → API endpoint

## Monorepo

Managed with npm workspaces:

- `packages/api`, `packages/ui`, `packages/proxy`

Documentation:

- JSDoc HTML: `docs/auto/api/`
- GraphQL schema: `docs/auto/graphql/`
- Vue component docs: `docs/auto/components/`
