# @freeboard/gateway

Datasource execution boundary service (HTTP fetch + realtime SSE/WebSocket/MQTT transport).

## Local Commands

- `npm run dev --workspace=packages/gateway`
- `npm run start --workspace=packages/gateway`
- `npm run test:gateway`

## Responsibilities

- Enforce outbound egress policy (host/port/private-destination controls)
- Validate datasource session tokens issued by API
- Introspect canonical datasource intent from API before outbound calls
- Execute:
  - HTTP datasource fetch via `POST /gateway/http/fetch`
  - realtime multiplex transport via `GET /gateway/realtime`

## Core Source Layout

- `src/index.ts`: composition root, server wiring, realtime orchestration
- `src/runtimeConfig.js`: env normalization and runtime limits
- `src/networkPolicy.js`: URL parsing + destination checks
- `src/gatewayApiClient.js`: API introspection/revocation client
- `src/gatewayHttp.js`: HTTP datasource execution path
- `src/realtime/`: protocol adapters and MQTT client implementation

## Required Runtime Config

- `JWT_GATEWAY_SECRET`
- `GATEWAY_SERVICE_TOKEN`
- `EGRESS_ALLOWED_HOSTS` (required for non-development runtime)

Optional tuning is documented in root `.env.example` (`REALTIME_*`, `FETCH_*`, `EGRESS_*`).

## Notes for Contributors

- Keep client-facing errors intentional and sanitized.
- Add/adjust tests in `packages/gateway/test` when touching auth, egress, or protocol handling.
- Preserve API/gateway contract compatibility with `packages/api/src/datasourceGateway.ts`.
