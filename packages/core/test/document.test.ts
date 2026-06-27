import assert from "node:assert/strict";
import test from "node:test";

import {
  DASHBOARD_DOCUMENT_SCHEMA_VERSION,
  ENVELOPE_KEYS,
  migrateDashboardDocument,
} from "../src/dashboardDocument.js";

const legacy = () => ({
  version: "2.9.0",
  _id: "653f1c2a9b1e4a0012345678",
  visibility: "private",
  shareToken: "secret",
  acl: [{ userId: "u1", accessLevel: "editor" }],
  title: "Legacy",
  columns: 4,
  width: "md",
  settings: { theme: "auto" },
  datasources: [],
  panes: [{ title: "Pane", layout: { x: 0, y: 0, w: 1, h: 1, i: "pane-abc" }, widgets: [] }],
});

test("migrate strips envelope keys and drops the legacy top-level version", () => {
  const doc = migrateDashboardDocument(legacy());
  for (const key of ENVELOPE_KEYS) {
    assert.ok(!(key in doc), `envelope key '${key}' must not survive migration`);
  }
  assert.equal(doc.version, undefined);
  assert.equal(doc.schemaVersion, DASHBOARD_DOCUMENT_SCHEMA_VERSION);
  // No legacy version->generator upgrade: a doc without a generator stays without one.
  assert.equal(doc.generator, undefined);
});

test("migrate derives a stable pane.id from layout.i", () => {
  const doc = migrateDashboardDocument(legacy());
  const panes = doc.panes as Array<Record<string, unknown>>;
  assert.equal(panes[0].id, "pane-abc");
});

test("migrate is non-mutating and idempotent", () => {
  const input = legacy();
  const snapshot = JSON.parse(JSON.stringify(input));
  const once = migrateDashboardDocument(input);
  assert.deepEqual(input, snapshot, "input not mutated");
  assert.deepEqual(migrateDashboardDocument(once), once, "idempotent on a current document");
});
