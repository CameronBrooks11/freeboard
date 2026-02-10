/**
 * @module widgets/PictureWidget
 * @description Image widget with optional refresh cache-busting.
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

const withCacheBust = (url) => {
  const base = String(url || "").trim();
  if (!base) {
    return "";
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}_cb=${Date.now()}`;
};

export class PictureWidget extends ReactiveWidget {
  static typeName = "picture";
  static label = "Picture";
  static preferredRows = 4;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        fitMode: widget?.settings?.fitMode ?? "cover",
        refreshSeconds: widget?.settings?.refreshSeconds,
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        {
          name: "fitMode",
          label: "Fit Mode",
          type: "option",
          default: "cover",
          options: [
            { label: "Cover", value: "cover" },
            { label: "Contain", value: "contain" },
          ],
        },
        {
          name: "refreshSeconds",
          label: "Refresh Every",
          type: "integer",
          suffix: "seconds",
        },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        srcPath: widget?.settings?.srcPath,
        altPath: widget?.settings?.altPath,
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "srcPath",
          label: "Image URL Path",
          type: "text",
          required: true,
          description: "Format: datasources.<id>.path or <datasourceTitle>.path",
        },
        { name: "altPath", label: "Alt Text Path", type: "text" },
        { name: "headerPath", label: "Header Path", type: "text" },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new PictureWidget(settings));
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

    this.imageWrap = document.createElement("div");
    this.imageWrap.style.flex = "1";
    this.imageWrap.style.minHeight = "80px";
    this.imageWrap.style.position = "relative";
    this.imageWrap.style.borderRadius = "4px";
    this.imageWrap.style.overflow = "hidden";
    this.imageWrap.style.backgroundColor = "rgba(15,23,42,0.35)";

    this.imageElement = document.createElement("img");
    this.imageElement.style.width = "100%";
    this.imageElement.style.height = "100%";
    this.imageElement.style.display = "block";

    this.placeholderElement = document.createElement("div");
    this.placeholderElement.style.position = "absolute";
    this.placeholderElement.style.inset = "0";
    this.placeholderElement.style.display = "flex";
    this.placeholderElement.style.alignItems = "center";
    this.placeholderElement.style.justifyContent = "center";
    this.placeholderElement.style.fontSize = "12px";
    this.placeholderElement.style.opacity = "0.8";
    this.placeholderElement.textContent = "No image";

    this.imageWrap.append(this.imageElement, this.placeholderElement);
    this.widgetElement.append(this.headerElement, this.imageWrap);

    this.onSettingsChanged(settings);
  }

  onSettingsChanged(newSettings) {
    super.onSettingsChanged(newSettings);

    this.imageElement.style.objectFit =
      this.currentSettings?.fitMode === "contain" ? "contain" : "cover";
    this.updateRefreshTimer();
  }

  resolveInputs() {
    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      src: this.getBinding(this.currentSettings?.srcPath),
      alt: this.getBinding(this.currentSettings?.altPath),
    };
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    const nextSrc = String(inputs.src || "").trim();
    this.currentSrc = nextSrc;
    this.imageElement.alt = inputs.alt ? String(inputs.alt) : "";

    this.refreshImage(false);
  }

  updateRefreshTimer() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    const seconds = Number(this.currentSettings?.refreshSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    this.refreshTimer = setInterval(() => this.refreshImage(true), seconds * 1000);
  }

  refreshImage(forceCacheBust) {
    if (!this.currentSrc) {
      this.imageElement.removeAttribute("src");
      this.placeholderElement.style.display = "flex";
      return;
    }

    this.placeholderElement.style.display = "none";
    this.imageElement.src = forceCacheBust ? withCacheBust(this.currentSrc) : this.currentSrc;
  }

  onDispose() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    super.onDispose();
  }

  getPreferredRows() {
    return PictureWidget.preferredRows;
  }
}
