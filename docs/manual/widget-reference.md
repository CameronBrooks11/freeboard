# Widget Reference

This page is for dashboard users configuring built-in widgets.

## Available Widgets

- Base
- Text
- Indicator
- Gauge
- Pointer
- Picture
- HTML
- Sparkline
- Table
- Bar Chart
- Status List
- Map

## Text

- Purpose: display a primary scalar value
- Required binding: `valuePath` (or use `valueTemplate`)
- Key settings: `headerText`, `size`, `precision`, `unitText`, `animate`
- Examples: [Text Widget Examples](/manual/widget-examples/text)

## Indicator

- Purpose: show on/off status
- Required binding: `valuePath`
- Key settings: `onText`, `offText`, `onColor`, `offColor`
- Examples: [Indicator Widget Examples](/manual/widget-examples/indicator)

## Gauge

- Purpose: display value against min/max range
- Required binding: `valuePath`
- Key settings: `min`, `max`, `precision`, `unitText`
- Examples: [Gauge Widget Examples](/manual/widget-examples/gauge)

## Pointer

- Purpose: directional/angle visualization
- Required binding: `anglePath`
- Key settings: `valueText`, `unitText`, `angleUnitText` (default `°`)
- Optional bindings: `valueTextPath`, `headerPath`, `unitPath`, `angleUnitPath`
- Examples: [Pointer Widget Examples](/manual/widget-examples/pointer)

## Picture

- Purpose: show image from URL
- Required binding: `srcPath`
- Key settings: `fitMode`, `refreshSeconds`
- Examples: [Picture Widget Examples](/manual/widget-examples/picture)

## HTML

- Purpose: render text or trusted HTML block
- Required binding: `htmlPath`
- Key settings: `mode` (`text` or `trusted_html`), `heightRows`
- Security note: use `trusted_html` only for trusted content sources
- Examples: [HTML Widget Examples](/manual/widget-examples/html)

## Sparkline

- Purpose: trend/history line chart
- Binding modes:
  - Single series: `valuePath`
  - Multi-series: `seriesPaths` (comma-separated)
- Key settings: `historyLength`, `lineWidth`, `includeLegend`, `legendText`, `scaleMode`, `minValue`, `maxValue`
- Examples: [Sparkline Widget Examples](/manual/widget-examples/sparkline)

## Table

- Purpose: display array data in a configurable tabular view
- Required binding: `valuePath` (must resolve to an array)
- Key settings: `columns`, `rowsPerPage` (`0` = no pagination), `sortable`, `striped`, `compact`
- Column fields: `field`, `header`, optional `width`, `align`, `format`
- Field paths are row-root (`metrics.cpu.usage`, `items[0].value`, `meta['sensor.name']`)
- Responsive behavior: horizontal scroll is enabled for narrow panes/viewports
- Examples: [Table Widget Examples](/manual/widget-examples/table)

## Bar Chart

- Purpose: compare categorical values with vertical or horizontal bars
- Required binding: `valuePath` (must resolve to an array of rows)
- Key settings: `orientation`, `showValues`, `showGrid`, `animated`, `colors`
- Field mapping: `labelField`, `valueField`, optional `seriesFields` (comma-separated for grouped bars)
- Preferred rows: vertical defaults to 8, horizontal scales with row count
- Examples: [Bar Chart Widget Examples](/manual/widget-examples/bar-chart)

## Status List

- Purpose: compact multi-item operational status list (label, value, status)
- Required binding: `valuePath` (must resolve to an array of items)
- Key settings: `labelField`, `valueField`, `statusField`, `statusColors`, `showIcons`, `compact`
- Status colors: JSON map merged with defaults (`ok`, `warn`, `error`, `offline`, `unknown`)
- Preferred rows: `min(itemCount, 8) + 1`
- Examples: [Status List Widget Examples](/manual/widget-examples/status-list)

## Map

- Purpose: map viewport centered by coordinates
- Required bindings: `latPath`, `lonPath`
- Optional binding: `labelPath`
- Key settings: `provider`, `zoom`, `showMarker`
- Current provider: OpenStreetMap embed
- Examples: [Map Widget Examples](/manual/widget-examples/map)

## Base

- Purpose: custom widget surface using iframe HTML/CSS/JS
- Use when: you need behavior not covered by built-in widgets
- See: [Base Widget Guide](/manual/widget-base-guide)
- Examples: [Base Widget Examples](/manual/widget-examples/base)
