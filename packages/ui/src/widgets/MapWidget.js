/**
 * @module widgets/MapWidget
 * @description Map widget with provider abstraction (OpenStreetMap implementation).
 */

import { ReactiveWidget } from "./runtime/ReactiveWidget";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const mapProviders = {
  openstreetmap: {
    label: "OpenStreetMap",
    buildEmbedUrl({ lat, lon, zoom, showMarker }) {
      const spanLon = 360 / Math.pow(2, zoom + 1);
      const spanLat = 170 / Math.pow(2, zoom + 1);

      const left = clamp(lon - spanLon / 2, -180, 180);
      const right = clamp(lon + spanLon / 2, -180, 180);
      const bottom = clamp(lat - spanLat / 2, -85, 85);
      const top = clamp(lat + spanLat / 2, -85, 85);

      const params = new URLSearchParams({
        bbox: `${left},${bottom},${right},${top}`,
        layer: "mapnik",
      });

      if (showMarker) {
        params.set("marker", `${lat},${lon}`);
      }

      return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
    },
  },
};

export class MapWidget extends ReactiveWidget {
  static typeName = "map";
  static label = "Map";
  static preferredRows = 4;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        provider: widget?.settings?.provider ?? "openstreetmap",
        zoom: widget?.settings?.zoom ?? 13,
        showMarker: widget?.settings?.showMarker ?? true,
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        {
          name: "provider",
          label: "Map Provider",
          type: "option",
          default: "openstreetmap",
          options: [{ label: "OpenStreetMap", value: "openstreetmap" }],
        },
        { name: "zoom", label: "Zoom", type: "integer", default: 13 },
        {
          name: "showMarker",
          label: "Show Marker",
          type: "boolean",
          default: true,
        },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        latPath: widget?.settings?.latPath,
        lonPath: widget?.settings?.lonPath,
        labelPath: widget?.settings?.labelPath,
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "latPath",
          label: "Latitude Path",
          type: "text",
          required: true,
          description: "Format: datasources.<id>.path or <datasourceTitle>.path",
        },
        {
          name: "lonPath",
          label: "Longitude Path",
          type: "text",
          required: true,
          description: "Format: datasources.<id>.path or <datasourceTitle>.path",
        },
        { name: "labelPath", label: "Label Path", type: "text" },
        { name: "headerPath", label: "Header Path", type: "text" },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new MapWidget(settings));
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

    this.mapFrame = document.createElement("iframe");
    this.mapFrame.style.flex = "1";
    this.mapFrame.style.minHeight = "120px";
    this.mapFrame.style.width = "100%";
    this.mapFrame.style.border = "0";
    this.mapFrame.style.borderRadius = "4px";
    this.mapFrame.loading = "lazy";
    this.mapFrame.referrerPolicy = "no-referrer-when-downgrade";

    this.statusElement = document.createElement("div");
    this.statusElement.style.marginTop = "6px";
    this.statusElement.style.fontSize = "12px";
    this.statusElement.style.opacity = "0.9";

    this.widgetElement.append(this.headerElement, this.mapFrame, this.statusElement);
  }

  resolveInputs() {
    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText,
      lat: this.getBinding(this.currentSettings?.latPath),
      lon: this.getBinding(this.currentSettings?.lonPath),
      label: this.getBinding(this.currentSettings?.labelPath),
    };
  }

  onInputsChanged(inputs) {
    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    const lat = Number(inputs.lat);
    const lon = Number(inputs.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      this.mapFrame.removeAttribute("src");
      this.statusElement.textContent = "Waiting for latitude/longitude values";
      return;
    }

    const providerKey = this.currentSettings?.provider || "openstreetmap";
    const provider = mapProviders[providerKey] || mapProviders.openstreetmap;

    const zoom = clamp(
      Number.isFinite(Number(this.currentSettings?.zoom))
        ? Math.floor(Number(this.currentSettings.zoom))
        : 13,
      1,
      19
    );

    const src = provider.buildEmbedUrl({
      lat: clamp(lat, -85, 85),
      lon: clamp(lon, -180, 180),
      zoom,
      showMarker: this.currentSettings?.showMarker !== false,
    });

    if (this.mapFrame.src !== src) {
      this.mapFrame.src = src;
    }

    const label = inputs.label ? ` · ${inputs.label}` : "";
    this.statusElement.textContent = `${provider.label} · ${lat.toFixed(5)}, ${lon.toFixed(
      5
    )}${label}`;
  }

  getPreferredRows() {
    return MapWidget.preferredRows;
  }
}
