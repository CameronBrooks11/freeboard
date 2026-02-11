# Datasource Reference

This page is for dashboard users configuring datasources and bindings.

## Built-in Datasources

## JSONDatasource

- Fetches JSON over HTTP(S)
- Supports periodic refresh
- Can use proxy path to avoid browser CORS restrictions

Proxy/security note:

- For local dev, `Use Proxy = true` usually works out of the box.
- For containerized production mode, upstream hosts must be included in `PROXY_ALLOWED_HOSTS`.
- See [Proxy](/manual/proxy) for allowlist and TLS behavior.

Typical settings:

- URL
- Use proxy
- Refresh interval
- Request method/headers (if configured)

## ClockDatasource

- Emits current time values at a fixed interval
- Useful for clocks, heartbeat indicators, and demo widgets

Typical settings:

- Refresh interval

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
  - check network/proxy errors in browser devtools
- Ambiguous title bindings:
  - prefer `datasources.<id>...` bindings for stability
