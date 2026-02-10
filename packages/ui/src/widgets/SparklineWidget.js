/**
 * @module widgets/SparklineWidget
 * @description Lightweight sparkline widget with single or multi-series support.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

const DEFAULT_COLORS = [
  "#f59e0b",
  "#22d3ee",
  "#a3e635",
  "#f43f5e",
  "#e879f9",
  "#38bdf8",
];

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseSeriesPaths = (raw) =>
  String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export class SparklineWidget extends ReactiveWidget {
  static typeName = "sparkline";
  static label = "Sparkline";
  static preferredRows = 3;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        historyLength: widget?.settings?.historyLength ?? 100,
        includeLegend: widget?.settings?.includeLegend ?? false,
        legendText: widget?.settings?.legendText ?? "",
        lineWidth: widget?.settings?.lineWidth ?? 2,
        scaleMode: widget?.settings?.scaleMode ?? "auto",
        minValue: widget?.settings?.minValue,
        maxValue: widget?.settings?.maxValue,
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        {
          name: "historyLength",
          label: "History Length",
          type: "integer",
          default: 100,
        },
        {
          name: "includeLegend",
          label: "Include Legend",
          type: "boolean",
          default: false,
        },
        {
          name: "legendText",
          label: "Legend Labels",
          type: "text",
          description: "Comma-separated labels for multi-series mode.",
        },
        {
          name: "lineWidth",
          label: "Line Width",
          type: "number",
          default: 2,
        },
        {
          name: "scaleMode",
          label: "Scale Mode",
          type: "option",
          default: "auto",
          options: [
            { label: "Auto", value: "auto" },
            { label: "Manual", value: "manual" },
          ],
        },
        { name: "minValue", label: "Manual Min", type: "number" },
        { name: "maxValue", label: "Manual Max", type: "number" },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        valuePath: widget?.settings?.valuePath,
        seriesPaths: widget?.settings?.seriesPaths ?? "",
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "valuePath",
          label: "Value Path",
          type: "text",
          description:
            "Single-series path. If empty, `Series Paths` or array values are used.",
        },
        {
          name: "seriesPaths",
          label: "Series Paths",
          type: "text",
          description: "Comma-separated binding paths for multi-series mode.",
        },
        { name: "headerPath", label: "Header Path", type: "text" },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new SparklineWidget(settings));
  }

  constructor(settings) {
    super(settings);
    this.seriesHistory = [];
    this.latestSeriesCount = 1;

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.height = "100%";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.style.flex = "1";
    this.canvasWrap.style.minHeight = "70px";
    this.canvasWrap.append(this.canvas);

    this.legendElement = document.createElement("div");
    this.legendElement.style.display = "none";
    this.legendElement.style.marginTop = "6px";
    this.legendElement.style.fontSize = "11px";
    this.legendElement.style.opacity = "0.95";

    this.widgetElement.append(this.headerElement, this.canvasWrap, this.legendElement);
  }

  resolveInputs() {
    const configuredSeriesPaths = parseSeriesPaths(this.currentSettings?.seriesPaths);
    let series = null;

    if (configuredSeriesPaths.length > 0) {
      series = configuredSeriesPaths.map((path) => this.getBinding(path));
    } else {
      const value = this.getBinding(this.currentSettings?.valuePath);
      if (Array.isArray(value)) {
        series = value;
      } else {
        series = [value];
      }
    }

    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      series: Array.isArray(series) ? series : [series],
    };
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    const numericSeries = (inputs.series || []).map((value) => toFiniteNumber(value));
    this.latestSeriesCount = Math.max(1, numericSeries.length);
    this.pushSeriesValues(numericSeries);
    this.renderLegend();
    this.draw();
  }

  onResize() {
    this.draw();
  }

  pushSeriesValues(values) {
    const historyLength = Math.max(
      2,
      Number.isFinite(Number(this.currentSettings?.historyLength))
        ? Math.ceil(Number(this.currentSettings.historyLength))
        : 100
    );

    while (this.seriesHistory.length < values.length) {
      this.seriesHistory.push([]);
    }

    this.seriesHistory.forEach((series, index) => {
      series.push(values[index] ?? null);
      if (series.length > historyLength) {
        series.shift();
      }
    });
  }

  getScaleBounds() {
    if (this.currentSettings?.scaleMode === "manual") {
      const min = Number(this.currentSettings?.minValue);
      const max = Number(this.currentSettings?.maxValue);
      if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
        return { min, max };
      }
    }

    const allValues = this.seriesHistory
      .flatMap((series) => series)
      .filter((value) => Number.isFinite(value));

    if (!allValues.length) {
      return { min: 0, max: 1 };
    }

    let min = Math.min(...allValues);
    let max = Math.max(...allValues);

    if (min === max) {
      min -= 1;
      max += 1;
    }

    return { min, max };
  }

  draw() {
    const width = this.canvasWrap.clientWidth;
    const height = this.canvasWrap.clientHeight;
    if (!width || !height) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    const context = this.canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const { min, max } = this.getScaleBounds();
    const lineWidth = Math.max(1, Number(this.currentSettings?.lineWidth) || 2);
    const longest = Math.max(...this.seriesHistory.map((series) => series.length), 0);

    if (longest < 2) {
      return;
    }

    this.seriesHistory.forEach((series, seriesIndex) => {
      context.beginPath();
      context.lineWidth = lineWidth;
      context.strokeStyle = DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length];
      context.lineJoin = "round";
      context.lineCap = "round";

      let started = false;
      series.forEach((point, pointIndex) => {
        if (!Number.isFinite(point)) {
          started = false;
          return;
        }

        const x =
          longest <= 1 ? 0 : (pointIndex / (longest - 1)) * Math.max(1, width - 1);
        const y = height - ((point - min) / (max - min)) * Math.max(1, height - 1);

        if (!started) {
          context.moveTo(x, y);
          started = true;
        } else {
          context.lineTo(x, y);
        }
      });

      context.stroke();
    });
  }

  renderLegend() {
    if (!this.currentSettings?.includeLegend || this.latestSeriesCount <= 1) {
      this.legendElement.style.display = "none";
      this.legendElement.innerHTML = "";
      return;
    }

    const labels = String(this.currentSettings?.legendText || "")
      .split(",")
      .map((value) => value.trim());

    this.legendElement.style.display = "flex";
    this.legendElement.style.flexWrap = "wrap";
    this.legendElement.style.gap = "8px";

    this.legendElement.innerHTML = "";
    for (let index = 0; index < this.latestSeriesCount; index += 1) {
      const item = document.createElement("div");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "4px";
      item.innerHTML = `<span style="color:${DEFAULT_COLORS[index % DEFAULT_COLORS.length]}">●</span>${
        labels[index] || `Series ${index + 1}`
      }`;
      this.legendElement.append(item);
    }
  }

  getPreferredRows() {
    return this.currentSettings?.includeLegend ? 3 : 2;
  }
}
