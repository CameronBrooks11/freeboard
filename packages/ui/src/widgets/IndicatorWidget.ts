/**
 * @module widgets/IndicatorWidget
 * @description Binary indicator widget with configurable labels and colors.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget.js";

/**
 * Indicator widget implementation.
 */
export class IndicatorWidget extends ReactiveWidget {
  static typeName = "indicator";

  static label = "Indicator";

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        onText: widget?.settings?.onText ?? "On",
        offText: widget?.settings?.offText ?? "Off",
        onColor: widget?.settings?.onColor ?? "#16a34a",
        offColor: widget?.settings?.offColor ?? "#4b5563",
      },
      fields: [
        {
          name: "headerText",
          label: "Header Text",
          type: "text",
        },
        {
          name: "onText",
          label: "On Text",
          type: "text",
        },
        {
          name: "offText",
          label: "Off Text",
          type: "text",
        },
        {
          name: "onColor",
          label: "On Color",
          type: "text",
        },
        {
          name: "offColor",
          label: "Off Color",
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
        headerPath: widget?.settings?.headerPath,
        onTextPath: widget?.settings?.onTextPath,
        offTextPath: widget?.settings?.offTextPath,
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
          name: "headerPath",
          label: "Header Path",
          type: "text",
        },
        {
          name: "onTextPath",
          label: "On Text Path",
          type: "text",
        },
        {
          name: "offTextPath",
          label: "Off Text Path",
          type: "text",
        },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new IndicatorWidget(settings));
  }

  constructor(settings) {
    super(settings);
    this.isNarrow = false;

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.justifyContent = "center";
    this.widgetElement.style.height = "100%";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    this.rowElement = document.createElement("div");
    this.rowElement.style.display = "flex";
    this.rowElement.style.alignItems = "center";
    this.rowElement.style.gap = "10px";

    this.lightElement = document.createElement("div");
    this.lightElement.style.width = "18px";
    this.lightElement.style.height = "18px";
    this.lightElement.style.borderRadius = "50%";
    this.lightElement.style.transition = "background-color 150ms ease, box-shadow 150ms ease";

    this.labelElement = document.createElement("div");
    this.labelElement.style.fontSize = "16px";

    this.rowElement.append(this.lightElement, this.labelElement);
    this.widgetElement.append(this.headerElement, this.rowElement);

    this.onSettingsChanged(settings);
  }

  applyResponsiveSizing() {
    const lightSize = this.isNarrow ? "14px" : "18px";
    this.lightElement.style.width = lightSize;
    this.lightElement.style.height = lightSize;
    this.labelElement.style.fontSize = this.isNarrow ? "13px" : "16px";
    this.headerElement.style.fontSize = this.isNarrow ? "11px" : "12px";
    this.headerElement.style.marginBottom = this.isNarrow ? "5px" : "8px";
    this.rowElement.style.gap = this.isNarrow ? "7px" : "10px";
  }

  onSettingsChanged(newSettings) {
    super.onSettingsChanged(newSettings);
    this.applyResponsiveSizing();
  }

  resolveInputs() {
    return {
      header: this.getBinding(this.currentSettings?.headerPath) ?? this.currentSettings?.headerText,
      onText: this.getBinding(this.currentSettings?.onTextPath) ?? this.currentSettings?.onText,
      offText: this.getBinding(this.currentSettings?.offTextPath) ?? this.currentSettings?.offText,
      value: this.getBinding(this.currentSettings?.valuePath),
    };
  }

  onInputsChanged(inputs) {
    const isOn = Boolean(inputs.value);

    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    this.lightElement.style.backgroundColor = isOn
      ? this.currentSettings?.onColor || "#16a34a"
      : this.currentSettings?.offColor || "#4b5563";

    this.lightElement.style.boxShadow = isOn
      ? `0 0 10px ${this.currentSettings?.onColor || "#16a34a"}`
      : "none";

    this.labelElement.textContent = isOn ? inputs.onText || "On" : inputs.offText || "Off";
  }

  onResize(size = {}) {
    const width = Number(size.width);
    this.isNarrow = Number.isFinite(width) && width > 0 && width < 240;
    this.applyResponsiveSizing();
  }
}
