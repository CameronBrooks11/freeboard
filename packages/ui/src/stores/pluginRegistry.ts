import { defineStore } from "pinia";
import { PLUGIN_MANIFEST } from "@freeboard/core";
import { runtimeConfig } from "../runtime/config.js";
import { validateWidgetPlugin } from "../widgets/runtime/plugin.js";
import { ClockDatasource } from "../datasources/ClockDatasource.js";
import { HTTPDatasource } from "../datasources/HTTPDatasource.js";
import { MQTTDatasource } from "../datasources/MQTTDatasource.js";
import { SSEDatasource } from "../datasources/SSEDatasource.js";
import { StaticDatasource } from "../datasources/StaticDatasource.js";
import { WebSocketDatasource } from "../datasources/WebSocketDatasource.js";
import { BaseWidget } from "../widgets/BaseWidget.js";
import { GaugeWidget } from "../widgets/GaugeWidget.js";
import { HtmlWidget } from "../widgets/HtmlWidget.js";
import { IndicatorWidget } from "../widgets/IndicatorWidget.js";
import { MapWidget } from "../widgets/MapWidget.js";
import { PictureWidget } from "../widgets/PictureWidget.js";
import { PointerWidget } from "../widgets/PointerWidget.js";
import { SparklineWidget } from "../widgets/SparklineWidget.js";
import { BarChartWidget } from "../widgets/BarChartWidget.js";
import { StatusListWidget } from "../widgets/StatusListWidget.js";
import { TableWidget } from "../widgets/TableWidget.js";
import { TextWidget } from "../widgets/TextWidget.js";
import type { DatasourcePlugin, WidgetPlugin } from "../types/runtime.js";

// The UI owns the datasource IMPLEMENTATIONS (classes are code); the manifest
// owns WHICH types exist and in WHICH build profile. Keyed by `typeName` so the
// manifest walk in `registerCorePlugins` resolves each entry to its class.
const DATASOURCE_PLUGINS_BY_TYPE: Record<string, DatasourcePlugin> = {
  [HTTPDatasource.typeName]: HTTPDatasource,
  [ClockDatasource.typeName]: ClockDatasource,
  [StaticDatasource.typeName]: StaticDatasource,
  [SSEDatasource.typeName]: SSEDatasource,
  [WebSocketDatasource.typeName]: WebSocketDatasource,
  [MQTTDatasource.typeName]: MQTTDatasource,
};

export const usePluginRegistryStore = defineStore("pluginRegistry", {
  state: () => ({
    datasourcePlugins: {} as Record<string, DatasourcePlugin>,
    widgetPlugins: {} as Record<string, WidgetPlugin>,
  }),

  actions: {
    registerDatasourcePlugin(plugin: DatasourcePlugin) {
      if (!plugin || typeof plugin.typeName !== "string" || !plugin.typeName.trim()) {
        throw new Error("Datasource plugin requires a non-empty string `typeName`");
      }
      const typeName = plugin.typeName.trim();
      if (plugin.label === undefined) {
        plugin.label = typeName;
      }
      this.datasourcePlugins[typeName] = plugin;
    },

    registerWidgetPlugin(plugin: WidgetPlugin) {
      const normalizedPlugin = validateWidgetPlugin(plugin);
      this.widgetPlugins[normalizedPlugin.typeName] = normalizedPlugin;
    },

    registerCorePlugins() {
      // Local-first (Lite): a static build has no server gateway, so the
      // gateway-only streaming datasources (SSE/WebSocket/MQTT) are not
      // registered — they cannot be added, and existing documents referencing
      // them load inert. HTTP stays (forced to direct mode); Clock/Static are
      // pure client-side. The lite/server split is sourced from the manifest's
      // `profiles[]` (the single source of truth) rather than hardcoded here.
      const activeProfile = runtimeConfig.isStaticBuild ? "lite" : "server";
      PLUGIN_MANIFEST.filter(
        (entry) => entry.kind === "datasource" && entry.profiles.includes(activeProfile),
      ).forEach((entry) => {
        const plugin = DATASOURCE_PLUGINS_BY_TYPE[entry.typeName];
        if (plugin) {
          this.registerDatasourcePlugin(plugin);
        }
      });

      [
        BaseWidget,
        TextWidget,
        IndicatorWidget,
        GaugeWidget,
        PointerWidget,
        PictureWidget,
        HtmlWidget,
        SparklineWidget,
        BarChartWidget,
        StatusListWidget,
        TableWidget,
        MapWidget,
      ].forEach((plugin) => {
        this.registerWidgetPlugin(plugin);
      });
    },

    getDatasourcePlugin(typeName: string): DatasourcePlugin | null {
      return this.datasourcePlugins[String(typeName || "")] || null;
    },

    getWidgetPlugin(typeName: string): WidgetPlugin | null {
      return this.widgetPlugins[String(typeName || "")] || null;
    },
  },
});
