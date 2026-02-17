/**
 * @module widgets/StatusListWidget
 * @description Compact status list widget for multi-item operational state display.
 */

import { resolveTableRowValue } from "./TableWidget.js";
import { ReactiveWidget } from "./runtime/ReactiveWidget.js";

const DEFAULT_STATUS_COLORS = {
  ok: "#16a34a",
  warn: "#f59e0b",
  warning: "#f59e0b",
  error: "#ef4444",
  offline: "#6b7280",
  unknown: "#64748b",
};

const DEFAULT_STATUS_ICONS = {
  ok: "●",
  warn: "▲",
  warning: "▲",
  error: "✖",
  offline: "○",
  unknown: "•",
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeStatusValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

export const parseStatusColorsMap = (rawValue) => {
  if (!rawValue) {
    return { ...DEFAULT_STATUS_COLORS };
  }

  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return {
      ...DEFAULT_STATUS_COLORS,
      ...Object.fromEntries(
        Object.entries(rawValue).map(([key, value]) => [normalizeStatusValue(key), String(value)]),
      ),
    };
  }

  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      return parseStatusColorsMap(parsed);
    } catch {
      return { ...DEFAULT_STATUS_COLORS };
    }
  }

  return { ...DEFAULT_STATUS_COLORS };
};

const normalizeItem = (item, settings) => {
  const labelField = String(settings.labelField || "label").trim() || "label";
  const valueField = String(settings.valueField || "value").trim() || "value";
  const statusField = String(settings.statusField || "status").trim() || "status";

  const label = resolveTableRowValue(item, labelField);
  const value = resolveTableRowValue(item, valueField);
  const status = resolveTableRowValue(item, statusField);

  return {
    label: label === undefined || label === null || label === "" ? "Item" : String(label),
    value: value === undefined || value === null ? "—" : String(value),
    status: normalizeStatusValue(status),
  };
};

export class StatusListWidget extends ReactiveWidget {
  static typeName = "status-list";
  static label = "Status List";

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        showIcons: widget?.settings?.showIcons ?? true,
        compact: widget?.settings?.compact ?? false,
        statusColors:
          widget?.settings?.statusColors ?? JSON.stringify(DEFAULT_STATUS_COLORS, null, 2),
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        { name: "showIcons", label: "Show Icons", type: "boolean", default: true },
        { name: "compact", label: "Compact", type: "boolean", default: false },
        {
          name: "statusColors",
          label: "Status Colors (JSON)",
          type: "code",
          language: "json",
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
        statusField: widget?.settings?.statusField ?? "status",
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "valuePath",
          label: "Items Path",
          type: "text",
          required: true,
        },
        { name: "labelField", label: "Label Field", type: "text", default: "label" },
        { name: "valueField", label: "Value Field", type: "text", default: "value" },
        { name: "statusField", label: "Status Field", type: "text", default: "status" },
        { name: "headerPath", label: "Header Path", type: "text" },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new StatusListWidget(settings));
  }

  constructor(settings) {
    super(settings);

    this.lastItemCount = 0;
    this.isNarrow = false;

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.height = "100%";
    this.widgetElement.style.width = "100%";
    this.widgetElement.style.overflow = "hidden";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    this.listElement = document.createElement("ul");
    this.listElement.style.listStyle = "none";
    this.listElement.style.margin = "0";
    this.listElement.style.padding = "0";
    this.listElement.style.display = "flex";
    this.listElement.style.flexDirection = "column";
    this.listElement.style.gap = "4px";
    this.listElement.style.overflowY = "auto";
    this.listElement.style.flex = "1";
    this.listElement.style.webkitOverflowScrolling = "touch";
    this.listElement.style.touchAction = "pan-y";
    this.listElement.setAttribute("role", "list");

    this.widgetElement.append(this.headerElement, this.listElement);
  }

  resolveInputs() {
    const rawItems = this.getBinding(this.currentSettings?.valuePath);
    const items = toArray(rawItems).map((item) => normalizeItem(item, this.currentSettings || {}));
    this.lastItemCount = items.length;

    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ?? this.currentSettings?.headerText ?? "",
      items,
      showIcons: this.currentSettings?.showIcons !== false,
      compact: this.currentSettings?.compact === true,
      colorMap: parseStatusColorsMap(this.currentSettings?.statusColors),
    };
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    this.listElement.innerHTML = "";

    if (!inputs.items.length) {
      const emptyItem = document.createElement("li");
      emptyItem.style.opacity = "0.8";
      emptyItem.style.fontSize = "12px";
      emptyItem.textContent = "No status items";
      this.listElement.append(emptyItem);
      return;
    }

    const compactMode = inputs.compact || this.isNarrow;
    this.listElement.style.gap = compactMode ? "3px" : "5px";

    inputs.items.forEach((item) => {
      const color =
        inputs.colorMap[item.status] || inputs.colorMap.unknown || DEFAULT_STATUS_COLORS.unknown;
      const icon = DEFAULT_STATUS_ICONS[item.status] || DEFAULT_STATUS_ICONS.unknown;

      const row = document.createElement("li");
      row.setAttribute("role", "listitem");
      row.style.display = "grid";
      row.style.gridTemplateColumns = inputs.showIcons ? "18px 1fr auto" : "1fr auto";
      row.style.alignItems = "center";
      row.style.columnGap = "8px";
      row.style.padding = compactMode ? "4px 6px" : "6px 8px";
      row.style.border = "1px solid var(--color-shade-2)";
      row.style.backgroundColor = "var(--color-shade-2)";
      row.style.borderLeft = `3px solid ${color}`;

      if (inputs.showIcons) {
        const iconElement = document.createElement("span");
        iconElement.textContent = icon;
        iconElement.style.color = color;
        iconElement.style.fontSize = compactMode ? "11px" : "12px";
        iconElement.setAttribute("aria-hidden", "true");
        row.append(iconElement);
      }

      const labelElement = document.createElement("span");
      labelElement.textContent = item.label;
      labelElement.style.fontSize = compactMode ? "12px" : "13px";
      labelElement.style.color = "var(--color-foreground)";
      row.append(labelElement);

      const valueElement = document.createElement("span");
      valueElement.textContent = item.value;
      valueElement.style.fontWeight = "600";
      valueElement.style.fontSize = compactMode ? "12px" : "13px";
      valueElement.style.color = color;
      row.append(valueElement);

      this.listElement.append(row);
    });
  }

  onResize(size = {}) {
    const width = Number(size.width);
    this.isNarrow = Number.isFinite(width) && width > 0 && width < 340;
    this.refresh();
  }

  getPreferredRows() {
    return Math.max(2, Math.min(this.lastItemCount || 0, 8) + 1);
  }
}
