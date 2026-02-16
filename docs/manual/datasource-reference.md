# Datasource Reference

This page is for dashboard users configuring datasources and bindings.

## Built-in Datasources

## HTTP (`http`)

- Fetches HTTP(S) data through gateway-backed execution (default).
- Supports periodic refresh polling.
- Parser modes: `json`, `text`, `csv`.
- Supports optional credential profile references (`credentialProfileId`).

Gateway/security notes:

- For production deployments, outbound destinations must be in `EGRESS_ALLOWED_HOSTS`.
- Direct browser mode is disabled by default; enable only for local development with `VITE_ALLOW_DIRECT_HTTP_DATASOURCE=true`.
- Gateway mode is required for any datasource using credential profiles.
- See [Datasource Gateway](/manual/gateway) for egress and token flow behavior.

Typical settings:

- URL
- Use gateway
- Refresh interval
- Stale threshold
- HTTP method
- Parser mode
- Timeout (ms)
- Headers (JSON)
- Body
- Credential profile (optional)

## SSE (`sse`)

- Gateway-backed Server-Sent Events stream.
- Best for one-way event feeds over HTTP.
- Parser modes: `json`, `text`.
- Optional credential profile support.
- Supports credential injection in:
  - headers (`authPlacement: "header"`)
  - query string (`authPlacement: "query"` + `queryParamName`)

Typical settings:

- URL
- Parser
- Idle timeout (ms)
- Headers (JSON)
- Credential profile (optional)
- Auth placement (`header` or `query`)
- Query param name (required for query auth)
- Stale threshold

## WebSocket (`websocket`)

- Gateway-backed upstream WebSocket stream.
- Browser connects only to Freeboard gateway (`/gateway/realtime`); gateway connects to upstream socket.
- Parser modes: `json`, `text`.
- Optional credential profile support.
- Supports upstream subprotocol list via `protocols`.
- Supports header/query credential placement, same as SSE.

Typical settings:

- URL
- Parser
- Idle timeout (ms)
- WebSocket subprotocols (comma-separated or array)
- Headers (JSON)
- Credential profile (optional)
- Auth placement (`header` or `query`)
- Query param name (required for query auth)
- Stale threshold

## MQTT (`mqtt`)

- Gateway-backed MQTT subscription stream (receive-only in this phase).
- Requires selecting a broker profile (`brokerProfileId`).
- Broker profile holds broker endpoint/policy metadata and optional credential profile reference.
- Parser modes: `json`, `text`.
- QoS supported: `0` or `1`.

Typical settings:

- Broker profile
- Topic
- QoS
- Parser
- Keepalive seconds
- Stale threshold

Admin prerequisites:

- Create a broker profile in Admin Console.
- For authenticated brokers, link a `basic` credential profile to the broker profile.
- For public/link dashboards, `allowPublicUse` must be enabled on required profiles.

## Clock (`clock`)

- Emits current time values on a fixed interval.
- Useful for clocks, heartbeat indicators, and diagnostics.

Typical settings:

- Refresh interval

## Static (`static`)

- Emits static JSON/text payload.
- Optional refresh interval if a widget should receive periodic re-emits.

Typical settings:

- Static value
- Refresh interval (`0` for emit-on-load/manual)

## Datasource Title Rules

Datasource titles are enforced to keep bindings deterministic:

- must be unique (case-insensitive)
- must be non-empty
- cannot be reserved names:
  - `datasources`
  - `datasourceTitles`

## Binding Paths

Widgets resolve bindings from a normalized snapshot.

Preferred formats:

- `datasources.<datasourceId>.path.to.value`
- `<datasourceTitle>.path.to.value`

Examples:

- `datasources.ds_ab12cd.payload.temperature`
- `Weather.payload.temperature`
- `Power.values[0]`

## Template Placeholders

Some widget fields support interpolation:

```text
{{ Weather.payload.temperature }} °C
{{ datasources.ds_ab12cd.status }}
```

## Troubleshooting

- Empty widget value:
  - confirm datasource is enabled
  - confirm binding path exists in latest payload
- Values stopped updating:
  - confirm refresh settings
  - check datasource status and error code in datasource list
- Realtime datasource disconnects:
  - verify `REALTIME_*` policy limits and protocol toggles on gateway
  - check broker profile/public-use policy for MQTT
  - verify token/session revocation events (share token rotation/visibility changes)
- Ambiguous title bindings:
  - prefer `datasources.<id>...` bindings for stability
