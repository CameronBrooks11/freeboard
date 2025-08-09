# Freeboard API

## Overview

The Freeboard API is a GraphQL server built on `graphql-yoga` with a MongoDB backend (`mongoose`). It provides dashboard and user management via queries, mutations and subscriptions, and uses JWT for authentication.

## Configuration (`config.js`)

- Loads environment variables via `dotenv`
- Exports a frozen `config` object with:
  - `mongoUrl` (MongoDB connection string)
  - `port` (HTTP port)
  - `jwtSecret`, `jwtTimeExpiration`
  - `userLimit`, `adminEmail`, `adminPassword`, `createAdmin`

## Request Context (`context.js`)

- `setContext({ req })` returns a context object containing:
  - `pubsub` (created via `createPubSub`)
  - `models` (`Dashboard`, `User`)
  - `user` (if a valid `Authorization: Bearer <token>` header is present)

## GraphQL Schema (`gql.js`)

- Merges SDL type definitions and resolver maps:
  - Types in `types/Dashboard.js` and `types/User.js`
  - Resolvers in `resolvers/*`
- Produces an executable schema via `makeExecutableSchema`

## Models

- **Dashboard** (`models/Dashboard.js`):
  - Uses `shortid` for string `_id`
  - Fields: `user`, `version`, `title`, `published`, `image`, `datasources`, `columns`, `width`, `panes`, `authProviders`, `settings`
  - Timestamps enabled
- **User** (`models/User.js`):
  - `_id` via `shortid`
  - Fields: `email`, `password`, `admin`, `active`, `registrationDate`, `lastLogin`
  - Pre-save hook hashes `password` with `bcrypt`

## Resolvers

- **Dashboard Resolvers** (`resolvers/Dashboard.js`):
  - `Query.dashboard(_id)` and `Query.dashboards()`
  - `Mutation.createDashboard`, `updateDashboard`, `deleteDashboard`
  - `Subscription.dashboard(_id)`
  - Helper `getDashboard` applies access rules and calls `transformDashboard`
- **User Resolvers** (`resolvers/User.js`):
  - `Query.listAllUsers()`
  - `Mutation.registerUser(email, password)`
  - `Mutation.authUser(email, password)`
  - `Mutation.deleteMyUserAccount()`
- **Merge Utility** (`resolvers/merge.js`):
  - `transformDashboard(u)` converts Mongoose doc to GraphQL object

## Input Validation (`validators.js`)

- `isValidEmail(email)` checks standard email pattern
- `isStrongPassword(password)` enforces digits, lowercase, uppercase, min length 8

## Server Entry Point (`index.js`)

- Connects to MongoDB (`mongoose.connect`)
- Optionally creates default admin user
- Sets up HTTP server with `createYoga`:
  - `landingPage: false`
  - `schema`, `context`, `useGraphQLSSE` plugin
- Listens on `config.port` (`0.0.0.0`)

## Running & Docs

- **Development**: `npm run dev --workspace=packages/api`
- **Generate reference docs**: `npm run docs:generate`
  - Runs JSDoc, GraphQL Codegen, Vue DocGen (for component library)
