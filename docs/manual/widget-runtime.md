# Widget Runtime

This page is for contributors working on widget internals.

## Runtime Goals

- deterministic widget lifecycle
- snapshot-based binding resolution
- per-widget failure isolation
- clean plugin registration contract

## Plugin Contract

A widget plugin must provide:

- `typeName` (non-empty string)
- `newInstance(settings, callback)`

Recommended static members:

- `label`
- `fields(widget, dashboard, general)`
- `preferredRows`

Registration validation is enforced in runtime plugin loading.

## Widget Instance Lifecycle

Typical instance methods:

- `render(element)`
- `onSettingsChanged(newSettings)`
- `processDatasourceUpdate(datasource, context)`
- `onResize(size)`
- `onDispose()`

Optional:

- `getPreferredRows(settings, snapshot)`

## Snapshot and Binding Model

Bindings resolve against dashboard snapshot shape:

```js
{
  datasources: { [datasourceId]: value },
  datasourceTitles: { [title]: datasourceId },
  [datasourceId]: value,
  [datasourceTitle]: value // when unique
}
```

Supported binding styles:

- `datasources.<id>.<path>`
- `<title>.<path>`
- dot and bracket notation

Reactive widget helpers:

- `getBinding(path)`
- `getTemplate(template)`

## Update Context

Widgets receive context with each update:

- `changedDatasource`
- `changedDatasourceId`
- `changedDatasourceTitle`
- `snapshot`
- `timestamp`

## Error Handling

- errors are trapped per widget
- widget wrapper stores `lastError`
- UI can show per-widget fallback message
- one widget failing does not stop dashboard update propagation

## Pane Height Integration

- widget preferred rows come from `getPreferredRows()` or plugin metadata
- dashboard computes pane minimum rows from contained widgets
- grid enforces `min-h` and layout clamping

## Contributor Flow (Short)

1. create widget file under `packages/ui/src/widgets/`
2. implement plugin class + instance lifecycle
3. register plugin in `packages/ui/src/components/Freeboard.vue`
4. validate bindings and resize behavior
5. document in `Widget Reference` if user-facing
