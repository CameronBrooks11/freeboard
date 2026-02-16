# HTTP Datasource Gateway

## Purpose

The gateway executes outbound HTTP datasource requests with API-issued session tokens and strict egress policy enforcement.

## Security Controls

- Allows only `http` and `https` targets.
- Rejects URL credentials (`user:pass@host`).
- Enforces host allowlist in production (`EGRESS_ALLOWED_HOSTS`).
- Enforces port allowlist (`EGRESS_ALLOWED_PORTS`).
- Blocks private/internal hostnames and resolved IP ranges by default.
- Uses DNS-pinned outbound routing:
  - resolve once
  - validate resolved destination
  - connect by pinned IP
  - preserve original host header and TLS SNI
- Requires datasource session token (`JWT_GATEWAY_SECRET` trust contract).
- Requires API introspection service-auth (`GATEWAY_SERVICE_TOKEN`).

## Endpoint

- `POST /gateway/http/fetch`
- Request body: `{ "dashboardId": "...", "datasourceId": "..." }`
- Header: `Authorization: Bearer <datasource-session-token>`
- In default compose deployment, gateway is reached via UI reverse proxy at `http://<host>:8080/gateway/http/fetch`.

## HTTP Fetch Contract

`POST /gateway/http/fetch` is the only Phase 5 fetch route exposed for datasource execution.

Request headers:

- `authorization: Bearer <datasource-session-token>`
- `content-type: application/json`

Request body:

```json
{
  "dashboardId": "<dashboard-id>",
  "datasourceId": "<datasource-id>"
}
```

Behavior:

- Browser clients submit only dashboard/datasource identifiers plus token.
- Raw upstream intent (URL, method, headers, parser, timeout) is never accepted from browser clients.
- Gateway resolves canonical intent through API introspection before egress.

Success response:

```json
{
  "dashboardId": "<dashboard-id>",
  "datasourceId": "<datasource-id>",
  "data": "<parsed-payload>",
  "fetchedAt": "2026-02-15T20:11:34.122Z"
}
```

Failure response:

```json
{
  "error": "Gateway request failed"
}
```

Error responses are sanitized and do not include decrypted credentials or internal stack traces.

## Key Environment Variables

- `EGRESS_ALLOWED_HOSTS` (required in production)
- `EGRESS_ALLOWED_PORTS` (default: `80,443`)
- `EGRESS_ALLOW_PRIVATE_DESTINATIONS` (default: `false`)
- `EGRESS_ALLOW_INSECURE_TLS` (default: `false`)
- `FETCH_TIMEOUT_MS` (default: `15000`)
- `FETCH_MAX_RESPONSE_BYTES` (default: `5242880`)
- `GATEWAY_INTROSPECTION_TIMEOUT_MS` (default: `5000`)
- `JWT_GATEWAY_SECRET` (required shared key)
- `GATEWAY_SERVICE_TOKEN` (required internal API service token)
- `GATEWAY_API_BASE_URL` (default: `http://127.0.0.1:4001`)

## Operational Notes

- Keep `EGRESS_ALLOW_INSECURE_TLS=false` in production.
- Keep `EGRESS_ALLOW_PRIVATE_DESTINATIONS=false` unless on a trusted local-only network.
- Review `EGRESS_ALLOWED_HOSTS` as part of deployment change control.
- Rotate `JWT_GATEWAY_SECRET` and `GATEWAY_SERVICE_TOKEN` during controlled maintenance windows.
- Rotate credential encryption keys using the [Credential Key Rotation Runbook](/manual/credential-key-rotation).
