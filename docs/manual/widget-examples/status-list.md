# Status List Widget Examples

## Example 1: Device Health Rollup

### Datasource Setup

1. Add datasource.
2. Set `Type = Static`.
3. Set `Title = deviceHealth`.
4. Set `Static Value` to:

```json
[
  { "label": "Compressor A", "value": "Running", "status": "ok" },
  { "label": "Conveyor B", "value": "Inspect", "status": "warn" },
  { "label": "Boiler C", "value": "Offline", "status": "offline" },
  { "label": "Pump D", "value": "Fault", "status": "error" }
]
```

5. Set `Refresh = 0`.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Status List`.
3. Set `Title = Device Health`.
4. Set `Items Path = deviceHealth`.
5. Leave `Label Field = label`, `Value Field = value`, and `Status Field = status`.
6. Enable `Show Icons`.
7. Save.

Expected output: compact list of device statuses with color-coded indicators.

## Example 2: Nested Status Object Mapping

### Datasource Setup

1. Add datasource.
2. Set `Type = Static`.
3. Set `Title = lineOps`.
4. Set `Static Value` to:

```json
[
  { "name": "Line 01", "state": { "value": "Ready", "code": "ok" } },
  { "name": "Line 02", "state": { "value": "Slow", "code": "warn" } },
  { "name": "Line 03", "state": { "value": "Down", "code": "error" } }
]
```

5. Set `Refresh = 0`.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Status List`.
3. Set `Title = Line Operations`.
4. Set `Items Path = lineOps`.
5. Set `Label Field = name`.
6. Set `Value Field = state.value`.
7. Set `Status Field = state.code`.
8. Optionally override `Status Colors (JSON)` with:

```json
{
  "ok": "#22c55e",
  "warn": "#f59e0b",
  "error": "#ef4444"
}
```

9. Save.

Expected output: nested state values rendered as a color-coded operations list.
