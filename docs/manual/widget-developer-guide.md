# Widget Developer Guide

This guide defines the baseline contract for adding built-in widgets to Freeboard.

## Goals

- Keep widgets display-only by default.
- Keep runtime deterministic and resilient (no widget should crash the board).
- Keep behavior responsive for desktop and `sm` mobile layouts.

## Runtime Contract

A widget plugin must provide:

- `typeName` (stable id used in persisted dashboards)
- `label` (user-facing name in the widget picker)
- `fields(widget, dashboard, general)` (settings schema)
- `newInstance(settings, callback)` (construct runtime instance)

Most widgets should extend `ReactiveWidget`:

- `resolveInputs()` reads bindings from `snapshot` using `getBinding(path)`/`getTemplate(template)`.
- `onInputsChanged(inputs, context)` updates DOM for the latest values (`context` is optional).
- `onResize({ width, height })` adapts rendering to pane size.
- `getPreferredRows()` returns expected minimum pane height impact.

See also: [Widget Runtime](/manual/widget-runtime)

## Settings Schema Patterns

- Put shared title/enable fields in `general`.
- Group custom settings into `Display` and `Bindings`.
- Use explicit defaults so dashboard JSON is predictable.
- Prefer simple scalar fields (`text`, `number`, `boolean`, `option`) over free-form code.

## Binding and Template Rules

- Binding paths should resolve against datasource snapshots:
  - `<datasourceTitle>.path.to.value`
  - `datasources.<datasourceId>.path.to.value`
- If a binding cannot resolve, render a safe empty value (for example `—`).
- Template strings should use `\{\{ path.to.value \}\}` placeholders only.

## Responsive Behavior Requirements

- Handle narrow panes (`width < ~320px`) in `onResize`.
- Degrade optional UI first (legends, extra labels, dense spacing).
- Avoid clipping/overflow for core values.
- Use `overflow: auto` only when necessary (tables/lists), not as a generic fallback.

## Error Handling Requirements

- Guard value parsing (`Number(...)`, JSON parse) and use safe fallbacks.
- Avoid throwing in `onInputsChanged`; prefer empty-state rendering.
- Clean up timers/animation frames in `onDispose`.

## Security Requirements

- No `eval`, `Function`, dynamic script execution, or equivalent code generation.
- No direct network requests in widget runtime.
- No unsafe HTML injection paths without strict sanitization.
- No direct writes to browser storage APIs from widget implementations.
- Respect execution-mode boundaries; do not bypass trusted/safe runtime controls.

## Testing Standards

Widget changes should include:

- Unit tests for parsing/normalization helpers.
- Runtime rendering tests for empty + valid states.
- Responsive tests for narrow layout behavior.
- Registration coverage (widget appears in plugin registry list).

## Example Widget Skeleton

```js
import { ReactiveWidget } from "./runtime/ReactiveWidget.js";

export class ValueBadgeWidget extends ReactiveWidget {
  static typeName = "value-badge";
  static label = "Value Badge";
  static preferredRows = 2;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        valuePath: widget?.settings?.valuePath,
      },
      fields: [{ name: "valuePath", label: "Value Path", type: "text", required: true }],
    },
  ];

  static newInstance(settings, callback) {
    callback(new ValueBadgeWidget(settings));
  }

  constructor(settings) {
    super(settings);
    this.badge = document.createElement("div");
    this.badge.style.padding = "6px 10px";
    this.badge.style.border = "1px solid var(--color-shade-3)";
    this.widgetElement.append(this.badge);
  }

  resolveInputs() {
    return {
      value: this.getBinding(this.currentSettings?.valuePath),
    };
  }

  onInputsChanged(inputs) {
    this.badge.textContent =
      inputs.value === null || inputs.value === undefined || inputs.value === ""
        ? "—"
        : String(inputs.value);
  }
}
```
