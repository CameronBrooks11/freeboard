/**
 * @module widgets/IndicatorWidget
 * @description Binary indicator widget with configurable labels and colors.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget.js";
import type { WidgetRuntimeInstance } from "../types/runtime.js";
type WidgetFieldSource = { settings?: Record<string, unknown>; title?: string } | null | undefined;

/**
 * Indicator widget implementation.
 */
export class IndicatorWidget extends ReactiveWidget {
  isNarrow = false;
  headerElement!: HTMLDivElement;
  rowElement!: HTMLDivElement;
  lightElement!: HTMLDivElement;
  labelElement!: HTMLDivElement;

  static typeName = "indicator";

  static label = "Indicator";

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

  static newInstance(
    settings: Record<string, unknown>,
    newInstanceCallback: (instance: WidgetRuntimeInstance) => void,
  ) {
    newInstanceCallback(new IndicatorWidget(settings));
  }

  constructor(settings: Record<string, unknown>) {
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

  onSettingsChanged(newSettings: Record<string, unknown>) {
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

  onInputsChanged(inputs: { header: string; value: unknown; onText: string; offText: string }) {
    const isOn = Boolean(inputs.value);

    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    const onColor = String(this.currentSettings?.onColor || "#16a34a");
    const offColor = String(this.currentSettings?.offColor || "#4b5563");

    this.lightElement.style.backgroundColor = isOn ? onColor : offColor;

    this.lightElement.style.boxShadow = isOn ? `0 0 10px ${onColor}` : "none";

    this.labelElement.textContent = isOn ? inputs.onText || "On" : inputs.offText || "Off";
  }

  onResize(size: { width?: number } = {}) {
    const width = Number(size.width);
    this.isNarrow = Number.isFinite(width) && width > 0 && width < 240;
    this.applyResponsiveSizing();
  }
}
