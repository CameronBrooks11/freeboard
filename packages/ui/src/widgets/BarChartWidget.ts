/**
 * @module widgets/BarChartWidget
 * @description Lightweight canvas bar chart widget with single- and multi-series support.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget.js";
import type { WidgetRuntimeInstance } from "../types/runtime.js";
import { resolveThemeChartColor, resolveThemeColor } from "./runtime/themeColors.js";
import { translateUiText } from "../i18n/index.js";
type WidgetFieldSource = { settings?: Record<string, unknown>; title?: string } | null | undefined;
type BarChartModel = {
  labels: string[];
  seriesKeys: string[];
  data: number[][];
  maxValue: number;
};
type BarChartInputs = {
  header: string;
  chartModel: BarChartModel;
  orientation: string;
  showValues: boolean;
  showGrid: boolean;
  animated: boolean;
  colors: string[];
};

const DEFAULT_BAR_COLORS = ["#4f87ff", "#f59e0b", "#10b981", "#ef4444", "#a855f7", "#06b6d4"];

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOrientation = (value: unknown): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "horizontal" ? "horizontal" : "vertical";
};

const parseCsv = (value: unknown): string[] =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeColorArray = (colors: unknown): string[] => {
  const fromArray = Array.isArray(colors) ? colors : [];
  const normalized = fromArray
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object" && typeof entry.color === "string") {
        return entry.color.trim();
      }
      return "";
    })
    .filter(Boolean);
  return normalized;
};

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const requestFrame =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback: (timestamp: number) => void) => setTimeout(() => callback(nowMs()), 16);

const cancelFrame =
  typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame
    : (id: ReturnType<typeof setTimeout>) => clearTimeout(id);

export const normalizeBarChartRows = (rows: unknown, settings: Record<string, unknown> = {}) => {
  const arrayRows = Array.isArray(rows) ? rows : [];
  const labelField = String(settings.labelField || "label").trim() || "label";
  const valueField = String(settings.valueField || "value").trim() || "value";
  const explicitSeriesFields = parseCsv(settings.seriesFields);

  const normalizedRows: Array<Record<string, unknown>> = arrayRows
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : null))
    .filter((row): row is Record<string, unknown> => Boolean(row));

  if (!normalizedRows.length) {
    return {
      labels: [],
      seriesKeys: [],
      data: [],
      maxValue: 0,
    };
  }

  let seriesKeys = [...explicitSeriesFields];
  if (!seriesKeys.length) {
    const firstRow = normalizedRows[0] || {};
    if (toFiniteNumber(firstRow[valueField]) !== null) {
      seriesKeys = [valueField];
    } else {
      seriesKeys = Object.keys(firstRow).filter(
        (key) => key !== labelField && toFiniteNumber(firstRow[key]) !== null,
      );
    }
  }

  if (!seriesKeys.length) {
    seriesKeys = [valueField];
  }

  const labels: string[] = [];
  const data: number[][] = [];
  let maxValue = 0;

  normalizedRows.forEach((row, index) => {
    const labelValue = row[labelField];
    labels.push(
      labelValue === undefined || labelValue === null ? `Item ${index + 1}` : String(labelValue),
    );

    const values = seriesKeys.map((seriesKey) => {
      const numeric = toFiniteNumber(row[seriesKey]);
      if (numeric === null) {
        return 0;
      }
      const clamped = Math.max(0, numeric);
      maxValue = Math.max(maxValue, clamped);
      return clamped;
    });

    data.push(values);
  });

  return {
    labels,
    seriesKeys,
    data,
    maxValue: maxValue || 1,
  };
};

export class BarChartWidget extends ReactiveWidget {
  lastModel: BarChartInputs | null = null;
  lastDataLength = 0;
  animationFrame: ReturnType<typeof requestAnimationFrame> | ReturnType<typeof setTimeout> | null =
    null;
  currentProgress = 1;
  previousValues: number[][] | null = null;
  latestValues: number[][] | null = null;
  isNarrow = false;

  headerElement!: HTMLDivElement;
  canvasWrap!: HTMLDivElement;
  canvas!: HTMLCanvasElement;
  legendElement!: HTMLDivElement;

  static typeName = "bar-chart";
  static label = "Bar Chart";

  static fields = (
    widget: WidgetFieldSource,
    dashboard: unknown,
    general: Record<string, unknown>,
  ) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        orientation: normalizeOrientation(widget?.settings?.orientation),
        showValues: widget?.settings?.showValues ?? true,
        showGrid: widget?.settings?.showGrid ?? true,
        animated: widget?.settings?.animated ?? true,
        colors: widget?.settings?.colors ?? DEFAULT_BAR_COLORS.map((color) => ({ color })),
      },
      fields: [
        {
          name: "headerText",
          label: "Header Text",
          type: "text",
        },
        {
          name: "orientation",
          label: "Orientation",
          type: "option",
          default: "vertical",
          options: [
            { label: "Vertical", value: "vertical" },
            { label: "Horizontal", value: "horizontal" },
          ],
        },
        { name: "showValues", label: "Show Values", type: "boolean", default: true },
        { name: "showGrid", label: "Show Grid", type: "boolean", default: true },
        { name: "animated", label: "Animated", type: "boolean", default: true },
        {
          name: "colors",
          label: "Series Colors",
          type: "array",
          settings: [{ name: "color", label: "Color", type: "text" }],
        },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        valuePath: widget?.settings?.valuePath,
        labelField: widget?.settings?.labelField ?? "label",
        valueField: widget?.settings?.valueField ?? "value",
        seriesFields: widget?.settings?.seriesFields ?? "",
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "valuePath",
          label: "Rows Path",
          type: "text",
          required: true,
          description: "Path resolving to an array of chart rows.",
        },
        {
          name: "labelField",
          label: "Label Field",
          type: "text",
          default: "label",
        },
        {
          name: "valueField",
          label: "Single-Series Value Field",
          type: "text",
          default: "value",
        },
        {
          name: "seriesFields",
          label: "Multi-Series Fields",
          type: "text",
          description: "Optional comma-separated fields for multi-series grouped bars.",
        },
        {
          name: "headerPath",
          label: "Header Path",
          type: "text",
        },
      ],
    },
  ];

  static newInstance(
    settings: Record<string, unknown>,
    newInstanceCallback: (instance: WidgetRuntimeInstance) => void,
  ) {
    newInstanceCallback(new BarChartWidget(settings));
  }

  constructor(settings: Record<string, unknown>) {
    super(settings);

    this.lastModel = null;
    this.lastDataLength = 0;
    this.animationFrame = null;
    this.currentProgress = 1;
    this.previousValues = null;
    this.latestValues = null;
    this.isNarrow = false;

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.height = "100%";
    this.widgetElement.style.width = "100%";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.style.flex = "1";
    this.canvasWrap.style.minHeight = "120px";
    this.canvasWrap.style.position = "relative";

    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.setAttribute("role", "img");

    this.legendElement = document.createElement("div");
    this.legendElement.style.display = "none";
    this.legendElement.style.marginTop = "6px";
    this.legendElement.style.fontSize = "11px";
    this.legendElement.style.opacity = "0.95";
    this.legendElement.style.flexWrap = "wrap";
    this.legendElement.style.gap = "8px";

    this.canvasWrap.append(this.canvas);
    this.widgetElement.append(this.headerElement, this.canvasWrap, this.legendElement);
    this.applyResponsiveSizing();
  }

  resolveInputs(): BarChartInputs {
    const rawRows = this.getBinding(this.currentSettings?.valuePath);
    const chartModel = normalizeBarChartRows(rawRows, this.currentSettings || {});
    this.lastDataLength = chartModel.labels.length;
    const headerValue =
      this.getBinding(this.currentSettings?.headerPath) ?? this.currentSettings?.headerText;

    return {
      header: headerValue === null || headerValue === undefined ? "" : String(headerValue),
      chartModel,
      orientation: normalizeOrientation(this.currentSettings?.orientation),
      showValues: this.currentSettings?.showValues !== false,
      showGrid: this.currentSettings?.showGrid !== false,
      animated: this.currentSettings?.animated !== false,
      colors: normalizeColorArray(this.currentSettings?.colors),
    };
  }

  onInputsChanged(inputs: BarChartInputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";
    this.canvas.setAttribute(
      "aria-label",
      inputs.header ? `Bar chart: ${inputs.header}` : "Bar chart",
    );

    this.renderLegend(inputs.chartModel.seriesKeys, inputs.colors);

    const nextValues = inputs.chartModel.data.map((values) => [...values]);
    if (inputs.animated && this.latestValues) {
      this.previousValues = this.latestValues.map((values) => [...values]);
      this.latestValues = nextValues;
      this.animateToLatest(inputs);
      return;
    }

    this.previousValues = null;
    this.latestValues = nextValues;
    this.currentProgress = 1;
    this.draw(inputs);
  }

  applyResponsiveSizing(size: { width?: number } = {}) {
    const width = Number(size.width);
    this.isNarrow = Number.isFinite(width) && width > 0 && width < 360;
    this.headerElement.style.fontSize = this.isNarrow ? "11px" : "12px";
    this.headerElement.style.marginBottom = this.isNarrow ? "6px" : "8px";
    this.legendElement.style.fontSize = this.isNarrow ? "10px" : "11px";
    this.canvasWrap.style.minHeight = this.isNarrow ? "100px" : "120px";
  }

  onResize(size: { width?: number } = {}) {
    this.applyResponsiveSizing(size);
    if (this.lastModel) {
      this.draw(this.lastModel);
    }
  }

  onDispose() {
    if (this.animationFrame) {
      cancelFrame(this.animationFrame);
      this.animationFrame = null;
    }
    super.onDispose();
  }

  animateToLatest(inputs: BarChartInputs) {
    if (this.animationFrame) {
      cancelFrame(this.animationFrame);
      this.animationFrame = null;
    }

    const durationMs = 220;
    const startedAt = nowMs();

    const step = (now: number) => {
      const elapsed = now - startedAt;
      this.currentProgress = Math.min(1, elapsed / durationMs);
      this.draw(inputs);

      if (this.currentProgress < 1) {
        this.animationFrame = requestFrame(step);
      } else {
        this.animationFrame = null;
        this.previousValues = null;
      }
    };

    this.animationFrame = requestFrame(step);
  }

  draw(inputs: BarChartInputs) {
    this.lastModel = inputs;

    const width = this.canvasWrap.clientWidth;
    const height = this.canvasWrap.clientHeight;
    if (!width || !height) {
      return;
    }

    const context = this.canvas.getContext?.("2d");
    if (!context) {
      return;
    }

    const dpr =
      typeof window !== "undefined" && Number(window.devicePixelRatio) > 0
        ? Number(window.devicePixelRatio)
        : 1;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const { chartModel, colors, orientation, showGrid, showValues } = inputs;
    const chartLabelColor = resolveThemeColor("--color-shade-8", "#94a3b8");
    const gridLineColor = resolveThemeColor("--color-shade-4", "#94a3b8");
    const axisLineColor = resolveThemeColor("--color-shade-5", "#64748b");
    const resolveSeriesColor = (seriesIndex: number) => {
      if (colors.length > 0) {
        const configuredColor = colors[seriesIndex % colors.length];
        if (configuredColor) {
          return configuredColor;
        }
      }
      return resolveThemeChartColor(
        seriesIndex,
        DEFAULT_BAR_COLORS[seriesIndex % DEFAULT_BAR_COLORS.length]!,
      );
    };
    const allowValueLabels = showValues && !this.isNarrow;
    const rowsCount = chartModel.labels.length;
    const seriesCount = chartModel.seriesKeys.length;
    if (!rowsCount || !seriesCount) {
      context.fillStyle = chartLabelColor;
      context.font = "12px sans-serif";
      context.fillText(translateUiText("widget.emptyChartData", {}, "No chart data"), 8, 20);
      return;
    }

    const chartPadding = {
      left: 36,
      right: 12,
      top: 12,
      bottom: orientation === "vertical" ? 28 : 12,
    };
    const chartWidth = Math.max(1, width - chartPadding.left - chartPadding.right);
    const chartHeight = Math.max(1, height - chartPadding.top - chartPadding.bottom);
    const maxValue = Math.max(1, chartModel.maxValue);
    const baselineX = chartPadding.left;
    const baselineY = chartPadding.top + chartHeight;

    if (showGrid) {
      context.strokeStyle = gridLineColor;
      context.lineWidth = 1;
      const gridLines = 4;
      for (let index = 0; index <= gridLines; index += 1) {
        if (orientation === "vertical") {
          const y = chartPadding.top + (chartHeight / gridLines) * index;
          context.beginPath();
          context.moveTo(chartPadding.left, y);
          context.lineTo(chartPadding.left + chartWidth, y);
          context.stroke();
        } else {
          const x = chartPadding.left + (chartWidth / gridLines) * index;
          context.beginPath();
          context.moveTo(x, chartPadding.top);
          context.lineTo(x, chartPadding.top + chartHeight);
          context.stroke();
        }
      }
    }

    context.strokeStyle = axisLineColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(chartPadding.left, chartPadding.top);
    context.lineTo(chartPadding.left, chartPadding.top + chartHeight);
    context.lineTo(chartPadding.left + chartWidth, chartPadding.top + chartHeight);
    context.stroke();

    context.font = "11px sans-serif";
    context.fillStyle = chartLabelColor;
    const categorySize =
      orientation === "vertical" ? chartWidth / rowsCount : chartHeight / rowsCount;
    const groupGap = 4;
    const innerGap = 3;
    const availableGroupSize = Math.max(8, categorySize - groupGap);
    const barThickness = Math.max(
      3,
      (availableGroupSize - innerGap * (seriesCount - 1)) / seriesCount,
    );

    chartModel.labels.forEach((label, rowIndex) => {
      const valueSet = chartModel.data[rowIndex] || [];
      const previousValueSet = this.previousValues?.[rowIndex];

      if (orientation === "vertical") {
        const categoryStartX = chartPadding.left + rowIndex * categorySize + groupGap / 2;
        context.textAlign = "center";
        context.fillText(label, categoryStartX + availableGroupSize / 2, baselineY + 16);

        valueSet.forEach((rawValue, seriesIndex) => {
          const previousRawValue = previousValueSet?.[seriesIndex] ?? rawValue;
          const animatedValue =
            previousRawValue + (rawValue - previousRawValue) * (this.currentProgress || 1);
          const barHeight = (animatedValue / maxValue) * chartHeight;
          const barX = categoryStartX + seriesIndex * (barThickness + innerGap);
          const barY = baselineY - barHeight;

          context.fillStyle = resolveSeriesColor(seriesIndex);
          context.fillRect(barX, barY, barThickness, barHeight);

          if (allowValueLabels) {
            context.fillStyle = chartLabelColor;
            context.textAlign = "center";
            context.fillText(
              String(Math.round(animatedValue * 100) / 100),
              barX + barThickness / 2,
              barY - 4,
            );
          }
        });
      } else {
        const categoryStartY = chartPadding.top + rowIndex * categorySize + groupGap / 2;
        context.textAlign = "right";
        context.fillText(label, chartPadding.left - 6, categoryStartY + availableGroupSize / 2 + 4);

        valueSet.forEach((rawValue, seriesIndex) => {
          const previousRawValue = previousValueSet?.[seriesIndex] ?? rawValue;
          const animatedValue =
            previousRawValue + (rawValue - previousRawValue) * (this.currentProgress || 1);
          const barWidth = (animatedValue / maxValue) * chartWidth;
          const barX = baselineX;
          const barY = categoryStartY + seriesIndex * (barThickness + innerGap);

          context.fillStyle = resolveSeriesColor(seriesIndex);
          context.fillRect(barX, barY, barWidth, barThickness);

          if (allowValueLabels) {
            context.fillStyle = chartLabelColor;
            context.textAlign = "left";
            context.fillText(
              String(Math.round(animatedValue * 100) / 100),
              barX + barWidth + 4,
              barY + barThickness - 1,
            );
          }
        });
      }
    });
  }

  renderLegend(seriesKeys: string[], colors: string[]) {
    if (!Array.isArray(seriesKeys) || seriesKeys.length <= 1) {
      this.legendElement.style.display = "none";
      this.legendElement.innerHTML = "";
      return;
    }

    this.legendElement.style.display = "flex";
    this.legendElement.innerHTML = "";
    const resolveSeriesColor = (seriesIndex: number) => {
      if (colors.length > 0) {
        const configuredColor = colors[seriesIndex % colors.length];
        if (configuredColor) {
          return configuredColor;
        }
      }
      return resolveThemeChartColor(
        seriesIndex,
        DEFAULT_BAR_COLORS[seriesIndex % DEFAULT_BAR_COLORS.length]!,
      );
    };

    seriesKeys.forEach((seriesKey, index) => {
      const item = document.createElement("div");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "4px";
      const marker = document.createElement("span");
      marker.textContent = "■";
      marker.style.color = resolveSeriesColor(index);

      const label = document.createElement("span");
      label.textContent = String(seriesKey);

      item.append(marker, label);
      this.legendElement.append(item);
    });
  }

  getPreferredRows() {
    const orientation = normalizeOrientation(this.currentSettings?.orientation);
    if (orientation === "vertical") {
      return 8;
    }
    return Math.max(2, Math.ceil((this.lastDataLength || 0) * 0.5));
  }
}
