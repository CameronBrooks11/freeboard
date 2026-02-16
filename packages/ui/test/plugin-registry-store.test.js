import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

import { usePluginRegistryStore } from "../src/stores/pluginRegistry.js";

beforeEach(() => {
  setActivePinia(createPinia());
});

test("plugin registry registers all core datasource and widget plugins idempotently", () => {
  const store = usePluginRegistryStore();

  store.registerCorePlugins();
  store.registerCorePlugins();

  assert.deepEqual(Object.keys(store.datasourcePlugins).sort(), [
    "clock",
    "http",
    "mqtt",
    "sse",
    "static",
    "websocket",
  ]);

  assert.deepEqual(Object.keys(store.widgetPlugins).sort(), [
    "base",
    "gauge",
    "html",
    "indicator",
    "map",
    "picture",
    "pointer",
    "sparkline",
    "text",
  ]);
});

test("plugin registry rejects invalid datasource plugin definitions", () => {
  const store = usePluginRegistryStore();

  assert.throws(
    () => {
      store.registerDatasourcePlugin({ typeName: "" });
    },
    {
      message: /Datasource plugin requires a non-empty string `typeName`/,
    }
  );
});
