/**
 * @module widgets/TextWidget
 * @description Text widget with optional title, units, and numeric animation.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Text widget implementation.
 */
export class TextWidget extends ReactiveWidget {
  static typeName = "text";

  static label = "Text";

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        size: widget?.settings?.size ?? "regular",
        animate: widget?.settings?.animate ?? true,
        precision: widget?.settings?.precision,
        unitText: widget?.settings?.unitText,
      },
      fields: [
        {
          name: "headerText",
          label: "Header Text",
          type: "text",
        },
        {
          name: "size",
          label: "Size",
          type: "option",
          default: "regular",
          options: [
            { label: "Regular", value: "regular" },
            { label: "Big", value: "big" },
          ],
        },
        {
          name: "animate",
          label: "Animate Numeric Changes",
          type: "boolean",
          default: true,
        },
        {
          name: "precision",
          label: "Precision",
          type: "integer",
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
        valueTemplate: widget?.settings?.valueTemplate,
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
        {
          name: "valueTemplate",
          label: "Value Template",
          type: "text",
          description: "Optional: use {{ datasource.path }} placeholders",
        },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new TextWidget(settings));
  }

  constructor(settings) {
    super(settings);

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.justifyContent = "center";
    this.widgetElement.style.height = "100%";
    this.widgetElement.style.width = "100%";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "6px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    const valueRow = document.createElement("div");
    valueRow.style.display = "flex";
    valueRow.style.alignItems = "flex-end";
    valueRow.style.gap = "8px";

    this.valueElement = document.createElement("div");
    this.valueElement.style.fontWeight = "500";
    this.valueElement.style.lineHeight = "1";

    this.unitElement = document.createElement("div");
    this.unitElement.style.fontSize = "16px";
    this.unitElement.style.opacity = "0.9";
    this.unitElement.style.paddingBottom = "4px";

    valueRow.append(this.valueElement, this.unitElement);
    this.widgetElement.append(this.headerElement, valueRow);

    this.onSettingsChanged(settings);
  }

  onSettingsChanged(newSettings) {
    super.onSettingsChanged(newSettings);

    const isBig = this.currentSettings?.size === "big";
    this.valueElement.style.fontSize = isBig ? "56px" : "32px";
  }

  resolveInputs() {
    const value = this.currentSettings?.valueTemplate
      ? this.getTemplate(this.currentSettings.valueTemplate)
      : this.getBinding(this.currentSettings?.valuePath);

    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      unit:
        this.getBinding(this.currentSettings?.unitPath) ??
        this.currentSettings?.unitText,
      value,
    };
  }

  formatValue(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    if (!isFiniteNumber(value)) {
      return String(value);
    }

    const precision = Number(this.currentSettings?.precision);
    if (Number.isInteger(precision) && precision >= 0) {
      return value.toFixed(precision);
    }

    return String(value);
  }

  applyAnimatedNumber(nextValue) {
    const shouldAnimate = this.currentSettings?.animate;

    if (!shouldAnimate || !isFiniteNumber(this.currentNumericValue)) {
      this.currentNumericValue = nextValue;
      this.valueElement.textContent = this.formatValue(nextValue);
      return;
    }

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    const from = this.currentNumericValue;
    const to = nextValue;
    const duration = 220;
    const startedAt = performance.now();

    const step = (now) => {
      const elapsed = now - startedAt;
      const t = Math.min(elapsed / duration, 1);
      const current = from + (to - from) * t;
      this.valueElement.textContent = this.formatValue(current);

      if (t < 1) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        this.currentNumericValue = to;
      }
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    this.unitElement.textContent = inputs.unit || "";
    this.unitElement.style.display = inputs.unit ? "block" : "none";

    if (isFiniteNumber(inputs.value)) {
      this.applyAnimatedNumber(inputs.value);
      return;
    }

    this.currentNumericValue = undefined;
    this.valueElement.textContent = this.formatValue(inputs.value);
  }

  onDispose() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    super.onDispose();
  }
}
