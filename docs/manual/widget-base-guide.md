# Base Widget Guide

This page documents how to use the `Base` widget for custom HTML/CSS/JS content.

## What Base Widget Is

`Base` renders an iframe using your configured:

- style (CSS)
- script (JavaScript)
- html (markup)
- optional external resources

It is intended for advanced custom display behavior.

## Datasource Update Event Contract

Your iframe script receives updates via `window.postMessage`.

Listen for:

```js
window.addEventListener("message", (event) => {
  if (event.data?.type !== "datasource:update") return;
  // use event.data fields
});
```

Core payload fields:

- `type`: `"datasource:update"`
- `datasource`: changed datasource id or title
- `datasourceId`
- `datasourceTitle`
- `value`: normalized datasource value
- `snapshot`: full normalized snapshot across datasources
- `raw`: original datasource payload

## Minimal Example

### HTML

```html
<div id="out">Waiting...</div>
```

### CSS

```css
body {
  margin: 0;
  font: 16px/1.4 sans-serif;
  color: #e5e7eb;
  background: #111827;
}
```

### JS

```js
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg?.type !== "datasource:update") return;

  const text = typeof msg.value === "object" ? JSON.stringify(msg.value) : String(msg.value);

  document.getElementById("out").textContent = text;
});
```

## Best Practices

- keep scripts small and deterministic
- guard all message handling (`type` checks)
- avoid long-running loops/timers
- sanitize/validate any HTML before injecting
- use `snapshot` for cross-datasource composition

## Widget Responsive Rendering Guidelines

All built-in widgets should remain readable in narrow panes and `sm` mobile layouts.

Runtime contract:

- `Widget.vue` forwards pane size through `onResize({ width, height })`.
- Widgets should treat `width < ~320px` as narrow and simplify layout.
- Prefer visual degradation over truncation or overflow.

Built-in behavior baseline:

- `Table`: reduces font size and enables horizontal scroll at narrow widths.
- `Status List`: switches to compact row spacing and tighter type at narrow widths.
- `Bar Chart`: reduces labels and suppresses value labels in narrow panes to prevent overlap.
- `Text`, `Indicator`, `Gauge`, `Pointer`: scale typography/visual size down for narrow panes.
- `Sparkline`: reduces label typography and keeps trend rendering legible in small panes.

Authoring recommendations:

- Keep header/value content independent so headers can hide without breaking data display.
- Treat optional UI (legends, value labels, units) as degradable at narrow widths.
- Avoid fixed pixel dimensions when container-relative sizing works.
- Use `overflow: auto` only for content that must remain accessible (tables/lists), not for core value glyphs.
- Keep `getPreferredRows()` realistic so pane min-height remains predictable on desktop and mobile.

## When Not to Use Base

Use built-in widgets when possible (Text, Gauge, Map, etc.) for:

- simpler configuration
- better consistency
- lower maintenance burden
