# Datasource Gateway (HTTP + Realtime)

## Purpose

The gateway is the execution boundary for outbound datasource traffic. It validates API-issued datasource session tokens, introspects canonical datasource intent from API, enforces egress/security policy, and then connects upstream.

## Security Controls

- Allows only supported outbound protocols:
  - HTTP datasource fetch: `http`, `https`
  - Realtime adapters: `http`, `https`, `ws`, `wss`, `mqtt`, `mqtts`
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

## Endpoints

HTTP fetch:

- `POST /gateway/http/fetch`
- Request body: `{ "dashboardId": "...", "datasourceId": "..." }`
- Header: `Authorization: Bearer <datasource-session-token>`

Realtime channel:

- `GET /gateway/realtime` (WebSocket upgrade)
- Browser sends protocol messages:
  - `subscribe` (`requestId`, `dashboardId`, `datasourceId`, `sessionToken`)
  - `unsubscribe` (`requestId`, `datasourceId`)
  - `ping`
- Gateway returns:
  - `ack`
  - `data`
  - `status`
  - `error`
  - `pong`

In default compose deployment, gateway is reached via UI reverse proxy at:

- `http://<host>:8080/gateway/http/fetch`
- `ws://<host>:8080/gateway/realtime`

## HTTP Fetch Contract

Request:

- `authorization: Bearer <datasource-session-token>`
- `content-type: application/json`

Body:

```json
{
  "dashboardId": "<dashboard-id>",
  "datasourceId": "<datasource-id>"
}
```

Success:

```json
{
  "dashboardId": "<dashboard-id>",
  "datasourceId": "<datasource-id>",
  "data": "<parsed-payload>",
  "fetchedAt": "2026-02-15T20:11:34.122Z"
}
```

Failure:

```json
{
  "error": "Gateway request failed"
}
```

Error responses are sanitized and do not include decrypted credentials or internal stack traces.

## Realtime Contract Notes

- Browser payload never includes raw upstream secrets.
- Session token scope for realtime is `datasource:stream`.
- Token refresh is done by re-sending `subscribe` with same datasource and a fresh token.
- Gateway enforces token expiry for active realtime subscriptions.
- Public/link subscriptions are revalidated via:
  - revocation feed polling (`/internal/gateway/revoked-tokens`)
  - periodic full introspection fallback.

## Key Environment Variables

Shared/egress:

- `EGRESS_ALLOWED_HOSTS` (required in production)
- `EGRESS_ALLOWED_PORTS` (default: `80,443,1883,8883`)
- `EGRESS_ALLOW_PRIVATE_DESTINATIONS` (default: `false`)
- `EGRESS_ALLOW_INSECURE_TLS` (default: `false`)
- `FETCH_TIMEOUT_MS` (default: `15000`)
- `FETCH_MAX_RESPONSE_BYTES` (default: `5242880`)
- `GATEWAY_INTROSPECTION_TIMEOUT_MS` (default: `5000`)
- `GATEWAY_REVOKED_TOKENS_TIMEOUT_MS` (default: `5000`)
- `GATEWAY_REVOKED_TOKENS_MAX_BATCH` (default: `500`)
- `JWT_GATEWAY_SECRET` (required shared key)
- `GATEWAY_SERVICE_TOKEN` (required internal API service token)
- `GATEWAY_API_BASE_URL` (default: `http://127.0.0.1:4001`)

Realtime global:

- `REALTIME_ENABLED`
- `REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP`
- `REALTIME_MAX_CONNECTIONS_PER_DASHBOARD`
- `REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION`
- `REALTIME_CONNECT_TIMEOUT_MS`
- `REALTIME_RECONNECT_MIN_MS`
- `REALTIME_RECONNECT_MAX_MS`
- `REALTIME_MAX_MESSAGE_BYTES`
- `REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN`
- `REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN`
- `REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN`
- `REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS`
- `REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS`
- `REALTIME_TRUST_PROXY_HOPS`

Realtime protocol toggles:

- `REALTIME_SSE_ENABLED`
- `REALTIME_SSE_IDLE_TIMEOUT_MS`
- `REALTIME_WS_ENABLED`
- `REALTIME_WS_IDLE_TIMEOUT_MS`
- `REALTIME_WS_PING_INTERVAL_MS`
- `REALTIME_MQTT_ENABLED`
- `REALTIME_MQTT_MAX_MESSAGE_BYTES`
- `REALTIME_MQTT_KEEPALIVE_SECONDS`
- `REALTIME_MQTT_ALLOWED_TOPICS`
- `REALTIME_MQTT_MAX_QOS`
- `REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER`
- `REALTIME_MQTT_IDLE_DISCONNECT_MS`

## Operational Notes

- Keep `EGRESS_ALLOW_INSECURE_TLS=false` in production.
- Keep `EGRESS_ALLOW_PRIVATE_DESTINATIONS=false` unless on a trusted local-only network.
- Review `EGRESS_ALLOWED_HOSTS` as part of deployment change control.
- Rotate `JWT_GATEWAY_SECRET` and `GATEWAY_SERVICE_TOKEN` during controlled maintenance windows.
- Rotate credential encryption keys using the [Credential Key Rotation Runbook](/manual/credential-key-rotation).
- In production, configure MQTT allowlists (`REALTIME_MQTT_ALLOWED_TOPICS` and/or broker `topicAllowlist`) before enabling MQTT datasources.
