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
- Optional bindings: `valueTextPath`, `headerPath`, `unitPath`
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
