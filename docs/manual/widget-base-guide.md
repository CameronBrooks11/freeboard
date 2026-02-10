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

  const text =
    typeof msg.value === "object"
      ? JSON.stringify(msg.value)
      : String(msg.value);

  document.getElementById("out").textContent = text;
});
```

## Best Practices

- keep scripts small and deterministic
- guard all message handling (`type` checks)
- avoid long-running loops/timers
- sanitize/validate any HTML before injecting
- use `snapshot` for cross-datasource composition

## When Not to Use Base

Use built-in widgets when possible (Text, Gauge, Map, etc.) for:

- simpler configuration
- better consistency
- lower maintenance burden
