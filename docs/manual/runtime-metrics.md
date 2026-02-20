# Runtime Metrics

Freeboard exposes lightweight runtime telemetry for operations visibility.

## Where Metrics Are Shown

- Admin Console runtime metrics section (`/admin`)
- Internal gateway metrics endpoint (service-token protected):
  - `GET /internal/metrics`

## API Metrics (in-memory)

- request count / error count
- avg / p95 / max request latency
- auth failure count
- datasource mint success/failure counts
- limiter allow/reject/backend-error/fail-open/fail-closed counts
- audit write failure count

## Gateway Metrics (in-memory)

- HTTP request count / error count / average latency
- realtime connection attempts/accepted/rejected/active
- realtime inbound/outbound message counts
- realtime error count
- realtime limiter allow/reject/backend-error/fail-open/fail-closed counts

## Access Control

- Runtime metrics query requires admin principal or `ops:read` service account scope.
- Gateway internal metrics endpoint requires `GATEWAY_SERVICE_TOKEN`.

## API-to-Gateway Metrics Bridge Settings

- `GATEWAY_RUNTIME_METRICS_URL` (default `http://127.0.0.1:8001/internal/metrics`)
- `FREEBOARD_GATEWAY_RUNTIME_METRICS_URL` (legacy-compatible alias)
- `GATEWAY_RUNTIME_METRICS_TIMEOUT_MS` (default `2500`)

## Practical Use

Use these metrics for:

- deployment smoke checks
- incident triage
- trend baselining before adding full external observability

These are process-local counters. Restarting API/gateway resets the in-memory values.
