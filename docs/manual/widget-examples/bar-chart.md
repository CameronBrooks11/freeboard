# Bar Chart Widget Examples

## Example 1: Production Throughput by Line

### Datasource Setup

1. Add datasource.
2. Set `Type = Static`.
3. Set `Title = throughput`.
4. Set `Static Value` to:

```json
[
  { "label": "Line A", "value": 128 },
  { "label": "Line B", "value": 96 },
  { "label": "Line C", "value": 143 },
  { "label": "Line D", "value": 88 }
]
```

5. Set `Refresh = 0`.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Bar Chart`.
3. Set `Title = Throughput`.
4. Set `Rows Path = throughput`.
5. Set `Label Field = label`.
6. Set `Single-Series Value Field = value`.
7. Set `Orientation = Vertical`.
8. Enable `Show Values`.
9. Save.

Expected output: vertical bars with value labels for each production line.

## Example 2: Multi-Series Shift Comparison

### Datasource Setup

1. Add datasource.
2. Set `Type = Static`.
3. Set `Title = shiftComparison`.
4. Set `Static Value` to:

```json
[
  { "label": "Mixer", "day": 38, "night": 29 },
  { "label": "Filler", "day": 44, "night": 41 },
  { "label": "Labeler", "day": 52, "night": 35 }
]
```

5. Set `Refresh = 0`.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Bar Chart`.
3. Set `Title = Day vs Night`.
4. Set `Rows Path = shiftComparison`.
5. Set `Label Field = label`.
6. Set `Multi-Series Fields = day,night`.
7. Set `Orientation = Horizontal`.
8. Set `Animated = true`.
9. Save.

Expected output: grouped horizontal bars with legend entries for day and night.
