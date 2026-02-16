import { defineStore } from "pinia";
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
import { TextWidget } from "../widgets/TextWidget.js";

export const usePluginRegistryStore = defineStore("pluginRegistry", {
  state: () => ({
    datasourcePlugins: {},
    widgetPlugins: {},
  }),

  actions: {
    registerDatasourcePlugin(plugin) {
      if (!plugin || typeof plugin.typeName !== "string" || !plugin.typeName.trim()) {
        throw new Error("Datasource plugin requires a non-empty string `typeName`");
      }
      const typeName = plugin.typeName.trim();
      if (plugin.label === undefined) {
        plugin.label = typeName;
      }
      this.datasourcePlugins[typeName] = plugin;
    },

    registerWidgetPlugin(plugin) {
      const normalizedPlugin = validateWidgetPlugin(plugin);
      this.widgetPlugins[normalizedPlugin.typeName] = normalizedPlugin;
    },

    registerCorePlugins() {
      [
        HTTPDatasource,
        ClockDatasource,
        StaticDatasource,
        SSEDatasource,
        WebSocketDatasource,
        MQTTDatasource,
      ].forEach((plugin) => {
        this.registerDatasourcePlugin(plugin);
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
        MapWidget,
      ].forEach((plugin) => {
        this.registerWidgetPlugin(plugin);
      });
    },

    getDatasourcePlugin(typeName) {
      return this.datasourcePlugins[String(typeName || "")] || null;
    },

    getWidgetPlugin(typeName) {
      return this.widgetPlugins[String(typeName || "")] || null;
    },
  },
});
