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
- See [HTTP Datasource Gateway](/manual/proxy) for egress and token flow behavior.

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
- Ambiguous title bindings:
  - prefer `datasources.<id>...` bindings for stability
