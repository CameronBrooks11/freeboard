# @freeboard/api

GraphQL API service for authentication, dashboard persistence, policy, and gateway introspection.

## Local Commands

- `npm run dev --workspace=packages/api`
- `npm run start --workspace=packages/api`
- `npm run test:api`

## Responsibilities

- GraphQL schema/resolvers in `src/types` and `src/resolvers`
- Auth, policy, and session enforcement
- Dashboard/user/profile persistence via Mongo models in `src/models`
- Gateway trust bridge:
  - datasource session token minting (`src/datasourceGateway.js`)
  - gateway introspection/revocation feeds (`src/resolvers/Datasource.js` and related paths)

## Required Runtime Config

Core:

- `MONGO_URL` (local) or `FREEBOARD_MONGO_URL` (containerized runtime path from root compose)
- `JWT_SECRET`
- `JWT_GATEWAY_SECRET`
- `GATEWAY_SERVICE_TOKEN`
- `CREDENTIAL_ENCRYPTION_KEY`

Policy/security controls are documented in root `.env.example`.

## Notes for Contributors

- Keep resolver-level authorization explicit and test-backed.
- Non-trivial auth/policy behavior should add tests under `packages/api/test`.
- If a change affects gateway intent/session behavior, run API and gateway tests together.
