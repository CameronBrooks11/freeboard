/**
 * @module widgets/PointerWidget
 * @description Compass/pointer widget for directional values.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

const normalizeAngle = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = parsed % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export class PointerWidget extends ReactiveWidget {
  static typeName = "pointer";
  static label = "Pointer";
  static preferredRows = 3;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        unitText: widget?.settings?.unitText ?? "",
        valueText: widget?.settings?.valueText ?? "",
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        { name: "unitText", label: "Unit Text", type: "text" },
        { name: "valueText", label: "Value Text", type: "text" },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        anglePath: widget?.settings?.anglePath,
        valueTextPath: widget?.settings?.valueTextPath,
        headerPath: widget?.settings?.headerPath,
        unitPath: widget?.settings?.unitPath,
      },
      fields: [
        {
          name: "anglePath",
          label: "Angle Path",
          type: "text",
          required: true,
          description: "Format: datasources.<id>.path or <datasourceTitle>.path",
        },
        { name: "valueTextPath", label: "Value Text Path", type: "text" },
        { name: "headerPath", label: "Header Path", type: "text" },
        { name: "unitPath", label: "Unit Path", type: "text" },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new PointerWidget(settings));
  }

  constructor(settings) {
    super(settings);

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

    this.dialWrap = document.createElement("div");
    this.dialWrap.style.position = "relative";
    this.dialWrap.style.width = "100%";
    this.dialWrap.style.maxWidth = "180px";
    this.dialWrap.style.aspectRatio = "1 / 1";
    this.dialWrap.style.margin = "0 auto";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.style.width = "100%";
    svg.style.height = "100%";

    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", "50");
    ring.setAttribute("r", "44");
    ring.setAttribute("fill", "transparent");
    ring.setAttribute("stroke", "rgba(148,163,184,0.4)");
    ring.setAttribute("stroke-width", "3");

    this.pointerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.pointerGroup.style.transformOrigin = "50% 50%";
    this.pointerGroup.style.transition = "transform 200ms ease";

    const pointer = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    pointer.setAttribute("points", "50,8 58,50 50,40 42,50");
    pointer.setAttribute("fill", "hsl(34 100% 50%)");

    const centerDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    centerDot.setAttribute("cx", "50");
    centerDot.setAttribute("cy", "50");
    centerDot.setAttribute("r", "4");
    centerDot.setAttribute("fill", "#ffffff");

    this.pointerGroup.append(pointer);
    svg.append(ring, this.pointerGroup, centerDot);
    this.dialWrap.append(svg);

    this.valueElement = document.createElement("div");
    this.valueElement.style.textAlign = "center";
    this.valueElement.style.fontSize = "24px";
    this.valueElement.style.fontWeight = "600";
    this.valueElement.style.marginTop = "8px";
    this.valueElement.style.lineHeight = "1.1";

    this.unitElement = document.createElement("div");
    this.unitElement.style.textAlign = "center";
    this.unitElement.style.fontSize = "12px";
    this.unitElement.style.opacity = "0.85";
    this.unitElement.style.marginTop = "2px";

    this.widgetElement.append(
      this.headerElement,
      this.dialWrap,
      this.valueElement,
      this.unitElement
    );
  }

  resolveInputs() {
    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      unit:
        this.getBinding(this.currentSettings?.unitPath) ??
        this.currentSettings?.unitText,
      angle: this.getBinding(this.currentSettings?.anglePath),
      valueText:
        this.getBinding(this.currentSettings?.valueTextPath) ??
        this.currentSettings?.valueText,
    };
  }

  onInputsChanged(inputs) {
    const angle = normalizeAngle(inputs.angle);

    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    this.unitElement.textContent = inputs.unit || "";
    this.unitElement.style.display = inputs.unit ? "block" : "none";

    if (angle === null) {
      this.pointerGroup.style.transform = "rotate(0deg)";
      this.valueElement.textContent = inputs.valueText || "—";
      return;
    }

    this.pointerGroup.style.transform = `rotate(${angle}deg)`;

    if (inputs.valueText !== null && inputs.valueText !== undefined && inputs.valueText !== "") {
      this.valueElement.textContent = String(inputs.valueText);
    } else {
      this.valueElement.textContent = `${Math.round(angle)}°`;
    }
  }

  getPreferredRows() {
    return PointerWidget.preferredRows;
  }
}
