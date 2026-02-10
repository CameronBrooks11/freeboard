/**
 * @module widgets/GaugeWidget
 * @description Circular gauge widget for numeric values with min/max range.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Gauge widget implementation.
 */
export class GaugeWidget extends ReactiveWidget {
  static typeName = "gauge";

  static label = "Gauge";

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        min: widget?.settings?.min ?? 0,
        max: widget?.settings?.max ?? 100,
        precision: widget?.settings?.precision ?? 0,
        unitText: widget?.settings?.unitText,
      },
      fields: [
        {
          name: "headerText",
          label: "Header Text",
          type: "text",
        },
        {
          name: "min",
          label: "Minimum",
          type: "number",
          default: 0,
          required: true,
        },
        {
          name: "max",
          label: "Maximum",
          type: "number",
          default: 100,
          required: true,
        },
        {
          name: "precision",
          label: "Precision",
          type: "integer",
          default: 0,
        },
        {
          name: "unitText",
          label: "Unit Text",
          type: "text",
        },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        valuePath: widget?.settings?.valuePath,
        unitPath: widget?.settings?.unitPath,
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "valuePath",
          label: "Value Path",
          type: "text",
          required: true,
          description: "Format: datasources.<id>.path or <datasourceTitle>.path",
        },
        {
          name: "unitPath",
          label: "Unit Path",
          type: "text",
        },
        {
          name: "headerPath",
          label: "Header Path",
          type: "text",
        },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new GaugeWidget(settings));
  }

  constructor(settings) {
    super(settings);

    this.radius = 54;
    this.circumference = 2 * Math.PI * this.radius;

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.justifyContent = "center";
    this.widgetElement.style.alignItems = "center";
    this.widgetElement.style.height = "100%";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    const gaugeWrap = document.createElement("div");
    gaugeWrap.style.position = "relative";
    gaugeWrap.style.width = "140px";
    gaugeWrap.style.height = "140px";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 140 140");
    svg.style.width = "100%";
    svg.style.height = "100%";

    const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    track.setAttribute("cx", "70");
    track.setAttribute("cy", "70");
    track.setAttribute("r", String(this.radius));
    track.setAttribute("fill", "transparent");
    track.setAttribute("stroke", "rgba(148,163,184,0.3)");
    track.setAttribute("stroke-width", "12");

    this.progress = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this.progress.setAttribute("cx", "70");
    this.progress.setAttribute("cy", "70");
    this.progress.setAttribute("r", String(this.radius));
    this.progress.setAttribute("fill", "transparent");
    this.progress.setAttribute("stroke", "hsl(120 70% 45%)");
    this.progress.setAttribute("stroke-width", "12");
    this.progress.setAttribute("stroke-linecap", "round");
    this.progress.setAttribute("stroke-dasharray", String(this.circumference));
    this.progress.setAttribute("stroke-dashoffset", String(this.circumference));
    this.progress.setAttribute("transform", "rotate(-90 70 70)");
    this.progress.style.transition = "stroke-dashoffset 180ms ease, stroke 180ms ease";

    const labelWrap = document.createElement("div");
    labelWrap.style.position = "absolute";
    labelWrap.style.inset = "0";
    labelWrap.style.display = "flex";
    labelWrap.style.flexDirection = "column";
    labelWrap.style.alignItems = "center";
    labelWrap.style.justifyContent = "center";

    this.valueElement = document.createElement("div");
    this.valueElement.style.fontSize = "28px";
    this.valueElement.style.fontWeight = "600";
    this.valueElement.style.lineHeight = "1";

    this.unitElement = document.createElement("div");
    this.unitElement.style.fontSize = "13px";
    this.unitElement.style.opacity = "0.9";

    labelWrap.append(this.valueElement, this.unitElement);

    svg.append(track, this.progress);
    gaugeWrap.append(svg, labelWrap);
    this.widgetElement.append(this.headerElement, gaugeWrap);

    this.onSettingsChanged(settings);
  }

  resolveInputs() {
    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      unit:
        this.getBinding(this.currentSettings?.unitPath) ??
        this.currentSettings?.unitText,
      value: this.getBinding(this.currentSettings?.valuePath),
    };
  }

  formatValue(value) {
    if (!Number.isFinite(value)) {
      return "—";
    }

    const precision = Number(this.currentSettings?.precision);
    if (Number.isInteger(precision) && precision >= 0) {
      return value.toFixed(precision);
    }

    return String(value);
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    this.unitElement.textContent = inputs.unit || "";
    this.unitElement.style.display = inputs.unit ? "block" : "none";

    const min = Number.isFinite(Number(this.currentSettings?.min))
      ? Number(this.currentSettings.min)
      : 0;
    const max = Number.isFinite(Number(this.currentSettings?.max))
      ? Number(this.currentSettings.max)
      : 100;

    const safeMax = max > min ? max : min + 1;
    const rawValue = Number(inputs.value);

    if (!Number.isFinite(rawValue)) {
      this.valueElement.textContent = "—";
      this.progress.setAttribute("stroke-dashoffset", String(this.circumference));
      return;
    }

    const clamped = clamp(rawValue, min, safeMax);
    const normalized = (clamped - min) / (safeMax - min);
    const hue = Math.round(normalized * 120);
    const offset = this.circumference * (1 - normalized);

    this.valueElement.textContent = this.formatValue(clamped);
    this.progress.setAttribute("stroke-dashoffset", String(offset));
    this.progress.setAttribute("stroke", `hsl(${hue} 70% 45%)`);
  }
}
