# Freeboard API

## Overview

The Freeboard API is a GraphQL server built on `graphql-yoga` with repository-driven datastore access. The release runtime path is PostgreSQL. It provides dashboard and user management via queries, mutations and subscriptions, and uses JWT for authentication.

## Configuration (`config.ts`)

- Loads environment variables with deterministic precedence:
  - process env (shell/CI)
  - `packages/api/.env` (optional package-local override)
  - repo-root `.env`
  - code defaults
- Exports a frozen `config` object with:
  - `dbBackend`
  - `postgresUrl` (PostgreSQL connection string)
  - `port` (HTTP port)
  - `jwtSecret`, `jwtTimeExpiration`
  - `jwtGatewaySecret`, `gatewayServiceToken`, `credentialEncryptionKey`
  - `userLimit`, `adminEmail`, `adminPassword`, `createAdmin`
  - auth/runtime policy defaults (`registrationMode`, `editorCanPublish`, `executionMode`, etc.)
  - login abuse controls (`authLoginMaxAttempts`, `authLoginWindowSeconds`, `authLoginLockSeconds`)
  - trusted proxy controls (`apiTrustProxyHops`)
  - shared security limiter controls (`securityLimiterBackend`, `securityLimiterFailureMode`, `securityLimiterNamespace`, `securityLimiter*`)
  - datasource token/introspection controls (`datasourceTokenMintRateLimit*`, `gatewayIntrospectionRateLimitPerMin`)
  - datasource session/revocation controls (`datasourceSessionTtlSeconds`, `gatewayRevokedTokens*`, `realtimeRevokeEventRetentionSeconds`)

## Request Context (`context.ts`)

- `setContext({ req })` returns a context object containing:
  - `pubsub` (created via `createPubSub`)
  - `models` (`Dashboard`, `User`)
  - `clientIp` (for auth throttling/audit context)
  - `user` (if a valid JWT `Authorization: Bearer <token>` header is present)
  - `serviceAccount` (if a valid service account bearer token `fsa_<id>.<secret>` is present)

`clientIp` derivation:

- Uses socket remote address by default (`API_TRUST_PROXY_HOPS=0`).
- When `API_TRUST_PROXY_HOPS>0`, the API selects a trusted client IP from `X-Forwarded-For` using right-to-left hop parsing.
- API and gateway both consume the same shared `@freeboard/shared/clientIp.js` derivation utility to prevent policy drift.
- If trusted-side proxy hop entries are malformed, derivation fails closed and falls back to socket/request IP.
- Reverse proxies in front of API should overwrite `X-Forwarded-For` with authoritative values (not append untrusted inbound chains).
- Security limiter key segments are hashed before persistence, so raw emails/share tokens/IP composites are not stored as limiter keys.

Operational rollout and rollback guidance for trust-hop and limiter controls is documented in:

- [Security Controls Rollout Runbook](/manual/security-controls-rollout)

Token auth is validated against persisted user state (`active` + `sessionVersion`) so revoked tokens become invalid server-side.

## GraphQL Schema (`gql.ts`)

- Merges SDL type definitions and resolver maps:
  - Types in `types/Dashboard.ts` and `types/User.ts`
  - Resolvers in `resolvers/*`
- Produces an executable schema via `makeExecutableSchema`

## Models

- **Dashboard** (`models/Dashboard.ts`):
  - Uses `nanoid` for string `_id`
  - Fields include: `user`, `version`, `title`, `visibility`, `shareToken`, `shareTokenVersion`, `documentRevision`, `acl`, `image`, `datasources`, `columns`, `width`, `panes`, `settings`
  - `documentRevision` is an optimistic-concurrency counter, bumped only when the document changes; an update may pass `expectedDocumentRevision` and is rejected with a `CONFLICT` error if it is stale
  - Timestamps enabled
- **CredentialProfile** (`models/CredentialProfile.ts`):
  - Server-managed datasource credential profile metadata + encrypted secret payload
  - Supports type-specific secret resolution for gateway execution
- **BrokerProfile** (`models/BrokerProfile.ts`):
  - Admin-managed broker metadata for realtime transports (`mqtt`)
  - Holds broker endpoint/policy data and references optional credential profile
- **ShareTokenRevocationEvent** (`models/ShareTokenRevocationEvent.ts`):
  - Durable event feed used by gateway for public/link stream revocation polling
- **User** (`models/User.ts`):
  - `_id` via `nanoid`
  - Fields: `email`, `password`, `role`, `active`, `sessionVersion`, `registrationDate`, `lastLogin`
  - Pre-save hook hashes `password` with `bcrypt`
  - Model-level validators enforce email and password policy (defense in depth)
- **ServiceAccount** (`models/ServiceAccount.ts`):
  - Admin-managed machine principal with scoped permissions
  - Tracks active state and last-used timestamp
- **ServiceAccountToken** (`models/ServiceAccountToken.ts`):
  - One-way hashed bearer token records for service accounts
  - Supports expiry, revocation, label metadata, and last-used timestamp

## Resolvers

- **Dashboard Resolvers** (`resolvers/Dashboard.ts`):
  - `Query.dashboard(_id)`, `dashboardByShareToken`, `dashboards`, `dashboardCollaborators`
  - Visibility/share/collaboration mutations (`setDashboardVisibility`, `rotateDashboardShareToken`, ACL, ownership transfer)
  - `Mutation.createDashboard`, `updateDashboard`, `deleteDashboard`
  - `Subscription.dashboard(_id)`
  - Access policy and safe/trusted payload enforcement are server-side validated
- **User Resolvers** (`resolvers/User.ts`):
  - `Query.listAllUsers()`, `me`, invite listing
  - Registration/invite flows + password reset flows
  - Login throttling with audit events
  - Admin lifecycle flows (create/update/deactivate/delete, invites, reset issuance)
  - Session revocation paths on role/active/password transitions
- **Merge Utility** (`resolvers/merge.ts`):
  - `transformDashboard(u)` converts datastore dashboard entity to GraphQL object
- **Credential Profile Resolvers** (`resolvers/CredentialProfile.ts`):
  - Admin CRUD for credential profiles
  - Redacted secret metadata only in API responses
- **Broker Profile Resolvers** (`resolvers/BrokerProfile.ts`):
  - Admin CRUD for broker profiles
  - Editor/admin read access for datasource configuration
- **Datasource Resolvers** (`resolvers/Datasource.ts`):
  - Session token minting for datasource runtime (`mintDatasourceSessionToken`)
- **Datasource Diagnostics Resolvers** (`resolvers/DatasourceDiagnostics.ts`):
  - Datasource configuration/health rollup (`adminDatasourceDiagnostics`)
  - Includes realtime datasource types (`http`, `clock`, `static`, `sse`, `websocket`, `mqtt`)
- **Service Account Resolvers** (`resolvers/ServiceAccount.ts`):
  - Admin service account CRUD + token lifecycle
  - Admin audit event query surface
  - Runtime metrics query for admin/scoped machine principals

## Input Validation (`validators.ts`)

- `normalizeEmail(email)` lowercases/trims email for consistent identity lookups
- `isValidEmail(email)` enforces valid `name@domain.ext` format
- `isStrongPassword(password)` enforces:
  - at least 12 chars
  - uppercase + lowercase + number + symbol
- Same policy is enforced for:
  - bootstrap admin (`CREATE_ADMIN=true`)
  - user registration (`registerUser`)
  - model persistence validation

## Server Entry Point (`index.ts`)

- Connects to configured data backend (PostgreSQL release path)
- Optionally creates default admin user
- Sets up HTTP server with `createYoga`:
  - `landingPage: false`
  - `schema`, `context`, `useGraphQLSSE` plugin
- Exposes internal service-auth introspection endpoint for gateway:
  - `POST /internal/gateway/datasource-introspect`
- Exposes internal service-auth revocation feed endpoint for gateway:
  - `POST /internal/gateway/revoked-tokens`
- Exposes internal service-auth shared limiter endpoint for gateway realtime controls:
  - `POST /internal/gateway/rate-limit/consume`
  - accepts only gateway realtime limiter scopes (`realtime-connect-ip`, `realtime-public-subscribe-ip`, `realtime-public-subscribe-share`)
- Listens on `config.port` (`0.0.0.0`)

## Running & Docs

- **Development**: `npm run dev --workspace=packages/api`
- **Tests**: `npm run test:api`
  - Test location: `packages/api/test/*.test.ts`
  - Focus: auth/config validation, resolver authorization boundaries, model credential policy
- **Generate reference docs**: `npm run docs:generate`
  - Runs TypeDoc, GraphQL Codegen, Vue DocGen (for component library)
