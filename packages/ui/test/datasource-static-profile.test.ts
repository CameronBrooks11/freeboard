// Force the static-build flag BEFORE the registry (and its transitive
// runtimeConfig) is dynamically imported inside the test. runtimeConfig reads
// the `__FREEBOARD_STATIC__` build-time global once, at module init.
(globalThis as Record<string, unknown>).__FREEBOARD_STATIC__ = true;

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

beforeEach(() => {
  setActivePinia(createPinia());
});

test("a static build registers only the client-capable datasource types", async () => {
  const { usePluginRegistryStore } = await import("../src/stores/pluginRegistry.js");
  const store = usePluginRegistryStore();

  store.registerCorePlugins();

  assert.deepEqual(Object.keys(store.datasourcePlugins).sort(), ["clock", "http", "static"]);

  // Gateway-only streaming datasources are not registered server-less, so they
  // cannot be added.
  for (const typeName of ["sse", "websocket", "mqtt"]) {
    assert.equal(
      store.getDatasourcePlugin(typeName),
      null,
      `'${typeName}' must be unavailable in a static build`,
    );
  }

  // Widgets are unaffected by the profile.
  assert.ok(Object.keys(store.widgetPlugins).length >= 12);
});
