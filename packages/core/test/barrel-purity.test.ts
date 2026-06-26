import assert from "node:assert/strict";
import test from "node:test";

import * as core from "../src/index.js";

// Defense-in-depth complement to scripts/check-core-headless.mjs: the package
// barrel must NOT value-export the Ajv-backed validator, so importing the barrel
// never pulls Ajv. (The validator lives behind the ./validate.js subpath.)
test("barrel does not value-export the Ajv-backed validator", () => {
  assert.equal("validateDashboardDocument" in core, false);
});

test("barrel does value-export the pure document layer", () => {
  assert.equal(typeof core.migrateDashboardDocument, "function");
  assert.equal(typeof core.normalizeDatasourceTitle, "function");
  assert.equal(typeof core.hasDatasourceTitleConflict, "function");
  assert.equal(typeof core.ensureUniqueDatasourceTitle, "function");
  assert.ok(core.RESERVED_DATASOURCE_TITLES instanceof Set);
  assert.equal(core.DASHBOARD_DOCUMENT_SCHEMA_VERSION, 1);
});
