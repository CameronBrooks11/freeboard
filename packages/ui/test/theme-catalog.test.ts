import assert from "node:assert/strict";
import test from "node:test";

import { DASHBOARD_THEME_PRESETS } from "../src/models/Dashboard.js";
import { DASHBOARD_THEME_CATALOG } from "../src/ui/themeCatalog.js";

test("theme catalog stays aligned with canonical presets and preview metadata", () => {
  assert.deepEqual(
    DASHBOARD_THEME_CATALOG.map((entry) => entry.value),
    [...DASHBOARD_THEME_PRESETS],
  );

  DASHBOARD_THEME_CATALOG.forEach((entry) => {
    assert.equal(entry.previewSwatches.length, 3);
    assert.ok(entry.labelKey.startsWith("form.labelTheme"));
  });
});
