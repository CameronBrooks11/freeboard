# Realtime Operations Runbook

This runbook covers day-2 operations for realtime datasources (`sse`, `websocket`, `mqtt`).

## Scope

- Gateway realtime channel (`/gateway/realtime`)
- Broker profile administration for MQTT
- Public/link authorization revocation behavior
- Deterministic local fixtures for validation

## Prerequisites

- API and gateway are running with shared:
  - `JWT_GATEWAY_SECRET`
  - `GATEWAY_SERVICE_TOKEN`
- Gateway can reach API (`GATEWAY_API_BASE_URL`).
- Realtime is enabled (`REALTIME_ENABLED=true`).
- Secret setup/rotation process is managed via [Secrets Operations Runbook](/manual/secrets-operations).

## Baseline Validation (Local)

1. Start fixture stack:

```bash
npm run demo:realtime:up
```

2. Run smoke checks:

```bash
npm run demo:realtime:smoke
```

3. Stop fixtures when done:

```bash
npm run demo:realtime:down
```

One-shot integration loop:

```bash
npm run test:realtime:integration
```

## MQTT Setup Workflow

1. In Admin Console, create a credential profile (type: `basic`) if broker auth is required.
2. Create a broker profile:
   - protocol: `mqtt`
   - broker URL: `mqtt://...` or `mqtts://...`
   - optional credential profile reference
   - optional topic allowlist
   - `allowPublicUse` only when needed for public/link dashboards
3. In dashboard datasource dialog, create MQTT datasource referencing broker profile + topic.

## Revocation Behavior

Public/link realtime access is revoked by:

- share token rotation
- visibility changes affecting external access
- public-use policy changes on credential/broker profiles

Gateway enforcement path:

1. Polls API revocation feed (`/internal/gateway/revoked-tokens`) on interval.
2. Disconnects stale public/link subscriptions.
3. Runs periodic full revalidation as fallback.
4. If feed cursor expires, performs immediate full revalidation and resumes incremental polling.

## Key Realtime Policy Knobs

Connection and rate limits:

- `REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP`
- `REALTIME_MAX_CONNECTIONS_PER_DASHBOARD`
- `REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION`
- `REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN`
- `REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN`
- `REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN`
- `REALTIME_TRUST_PROXY_HOPS`
- `API_TRUST_PROXY_HOPS`

Revalidation:

- `REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS`
- `REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS`
- `REALTIME_REVOKE_EVENT_RETENTION_SECONDS`

Protocol toggles:

- `REALTIME_SSE_ENABLED`
- `REALTIME_WS_ENABLED`
- `REALTIME_MQTT_ENABLED`

MQTT policy:

- `REALTIME_MQTT_ALLOWED_TOPICS`
- `REALTIME_MQTT_MAX_QOS`
- `REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER`
- `REALTIME_MQTT_IDLE_DISCONNECT_MS`

## Production Hardening Checklist

- Set explicit `EGRESS_ALLOWED_HOSTS` and `EGRESS_ALLOWED_PORTS`.
- Keep `EGRESS_ALLOW_PRIVATE_DESTINATIONS=false` unless intentionally required.
- Keep `EGRESS_ALLOW_INSECURE_TLS=false`.
- Set MQTT allowlists (global and/or broker-level) before enabling MQTT broadly.
- Keep protocol toggles off for unused transports.
- Validate `REALTIME_TRUST_PROXY_HOPS` and `API_TRUST_PROXY_HOPS` for reverse-proxy deployments.
- Ensure edge reverse proxies overwrite `X-Forwarded-For` instead of appending untrusted inbound values.
- Use [Secrets Operations Runbook](/manual/secrets-operations) for token/key rotation windows.
