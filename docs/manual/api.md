# Freeboard API

## Overview

The Freeboard API is a GraphQL server built on `graphql-yoga` with a MongoDB backend (`mongoose`). It provides dashboard and user management via queries, mutations and subscriptions, and uses JWT for authentication.

## Configuration (`config.js`)

- Loads environment variables with deterministic precedence:
  - process env (shell/CI)
  - `packages/api/.env` (optional package-local override)
  - repo-root `.env`
  - code defaults
- Exports a frozen `config` object with:
  - `mongoUrl` (MongoDB connection string)
  - `port` (HTTP port)
  - `jwtSecret`, `jwtTimeExpiration`
  - `userLimit`, `adminEmail`, `adminPassword`, `createAdmin`
  - auth/runtime policy defaults (`registrationMode`, `editorCanPublish`, `executionMode`, etc.)
  - login abuse controls (`authLoginMaxAttempts`, `authLoginWindowSeconds`, `authLoginLockSeconds`)

## Request Context (`context.js`)

- `setContext({ req })` returns a context object containing:
  - `pubsub` (created via `createPubSub`)
  - `models` (`Dashboard`, `User`)
  - `clientIp` (for auth throttling/audit context)
  - `user` (if a valid `Authorization: Bearer <token>` header is present)

Token auth is validated against persisted user state (`active` + `sessionVersion`) so revoked tokens become invalid server-side.

## GraphQL Schema (`gql.js`)

- Merges SDL type definitions and resolver maps:
  - Types in `types/Dashboard.js` and `types/User.js`
  - Resolvers in `resolvers/*`
- Produces an executable schema via `makeExecutableSchema`

## Models

- **Dashboard** (`models/Dashboard.js`):
  - Uses `nanoid` for string `_id`
  - Fields include: `user`, `version`, `title`, `visibility`, `shareToken`, `acl`, `image`, `datasources`, `columns`, `width`, `panes`, `authProviders`, `settings`
  - Timestamps enabled
- **User** (`models/User.js`):
  - `_id` via `nanoid`
  - Fields: `email`, `password`, `role`, `active`, `sessionVersion`, `registrationDate`, `lastLogin`
  - Pre-save hook hashes `password` with `bcrypt`
  - Model-level validators enforce email and password policy (defense in depth)

## Resolvers

- **Dashboard Resolvers** (`resolvers/Dashboard.js`):
  - `Query.dashboard(_id)`, `dashboardByShareToken`, `dashboards`, `dashboardCollaborators`
  - Visibility/share/collaboration mutations (`setDashboardVisibility`, `rotateDashboardShareToken`, ACL, ownership transfer)
  - `Mutation.createDashboard`, `updateDashboard`, `deleteDashboard`
  - `Subscription.dashboard(_id)`
  - Access policy and safe/trusted payload enforcement are server-side validated
- **User Resolvers** (`resolvers/User.js`):
  - `Query.listAllUsers()`, `me`, invite listing
  - Registration/invite flows + password reset flows
  - Login throttling with audit events
  - Admin lifecycle flows (create/update/deactivate/delete, invites, reset issuance)
  - Session revocation paths on role/active/password transitions
- **Merge Utility** (`resolvers/merge.js`):
  - `transformDashboard(u)` converts Mongoose doc to GraphQL object

## Input Validation (`validators.js`)

- `normalizeEmail(email)` lowercases/trims email for consistent identity lookups
- `isValidEmail(email)` enforces valid `name@domain.ext` format
- `isStrongPassword(password)` enforces:
  - at least 12 chars
  - uppercase + lowercase + number + symbol
- Same policy is enforced for:
  - bootstrap admin (`CREATE_ADMIN=true`)
  - user registration (`registerUser`)
  - model persistence validation

## Server Entry Point (`index.js`)

- Connects to MongoDB (`mongoose.connect`)
- Optionally creates default admin user
- Sets up HTTP server with `createYoga`:
  - `landingPage: false`
  - `schema`, `context`, `useGraphQLSSE` plugin
- Listens on `config.port` (`0.0.0.0`)

## Running & Docs

- **Development**: `npm run dev --workspace=packages/api`
- **Tests**: `npm run test:api`
  - Test location: `packages/api/test/*.test.js`
  - Focus: auth/config validation, resolver authorization boundaries, model credential policy
- **Generate reference docs**: `npm run docs:generate`
  - Runs JSDoc, GraphQL Codegen, Vue DocGen (for component library)
