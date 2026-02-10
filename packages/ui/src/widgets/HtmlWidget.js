/**
 * @module widgets/HtmlWidget
 * @description HTML widget with explicit trust mode.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

export class HtmlWidget extends ReactiveWidget {
  static typeName = "html";
  static label = "HTML";
  static preferredRows = 3;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        mode: widget?.settings?.mode ?? "text",
        heightRows: widget?.settings?.heightRows ?? 3,
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        {
          name: "mode",
          label: "Render Mode",
          type: "option",
          default: "text",
          options: [
            { label: "Plain Text (Safe)", value: "text" },
            { label: "Trusted HTML", value: "trusted_html" },
          ],
        },
        {
          name: "heightRows",
          label: "Height Blocks",
          type: "integer",
          default: 3,
          description: "Used for pane minimum height.",
        },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        htmlPath: widget?.settings?.htmlPath,
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "htmlPath",
          label: "HTML/Text Path",
          type: "text",
          required: true,
          description: "Format: datasources.<id>.path or <datasourceTitle>.path",
        },
        { name: "headerPath", label: "Header Path", type: "text" },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new HtmlWidget(settings));
  }

  constructor(settings) {
    super(settings);

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.height = "100%";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    this.contentElement = document.createElement("div");
    this.contentElement.style.flex = "1";
    this.contentElement.style.overflow = "auto";
    this.contentElement.style.whiteSpace = "normal";
    this.contentElement.style.fontSize = "14px";
    this.contentElement.style.lineHeight = "1.4";
    this.contentElement.style.userSelect = "text";

    this.widgetElement.append(this.headerElement, this.contentElement);
  }

  resolveInputs() {
    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      content: this.getBinding(this.currentSettings?.htmlPath),
    };
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    const content = inputs.content === null || inputs.content === undefined
      ? ""
      : String(inputs.content);

    if (this.currentSettings?.mode === "trusted_html") {
      this.contentElement.innerHTML = content;
    } else {
      this.contentElement.textContent = content;
    }
  }

  getPreferredRows() {
    const rows = Number(this.currentSettings?.heightRows);
    if (!Number.isFinite(rows)) {
      return HtmlWidget.preferredRows;
    }
    return Math.max(1, Math.ceil(rows));
  }
}
