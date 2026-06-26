import assert from "node:assert/strict";
import test from "node:test";

import { Dashboard } from "../src/models/Dashboard.js";
import { ENVELOPE_KEYS, migrateDashboardDocument } from "@freeboard/core";

const legacyExport = () => ({
  version: "2.9.0",
  _id: "653f1c2a9b1e4a0012345678",
  visibility: "private",
  shareToken: "secret-token",
  shareTokenVersion: 3,
  acl: [{ userId: "u1", accessLevel: "editor" }],
  isOwner: true,
  canEdit: true,
  canManageSharing: true,
  title: "Legacy",
  image: null,
  columns: 4,
  width: "md",
  settings: { theme: "auto", allowMobileEdit: false },
  datasources: [{ id: "ds1", title: "API", type: "http", enabled: true, settings: { url: "x" } }],
  panes: [
    {
      title: "Pane",
      layout: { x: 0, y: 0, w: 1, h: 1, i: "pane-abc" },
      widgets: [{ id: "w1", title: null, type: "text", enabled: true, settings: {} }],
    },
  ],
});

test("migrate strips envelope fields, folds version into generator, stamps schemaVersion", () => {
  const doc = migrateDashboardDocument(legacyExport());

  for (const key of ENVELOPE_KEYS) {
    assert.ok(!(key in doc), `envelope key '${key}' must not survive migration`);
  }
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.version, undefined);
  assert.deepEqual(doc.generator, { name: "freeboard", version: "2.9.0" });
});

test("migrate derives a stable pane.id from the grid layout.i", () => {
  const doc = migrateDashboardDocument(legacyExport());
  const panes = doc.panes as Array<Record<string, unknown>>;
  assert.equal(panes[0].id, "pane-abc");
});

test("migrate is non-mutating and idempotent on a current document", () => {
  const input = legacyExport();
  const snapshot = JSON.parse(JSON.stringify(input));
  const once = migrateDashboardDocument(input);
  assert.deepEqual(input, snapshot, "input must not be mutated");

  const twice = migrateDashboardDocument(once);
  assert.deepEqual(twice, once, "migrating a current document must be a no-op");
});

test("toDocument produces a clean v1 document with no server metadata", () => {
  const dashboard = new Dashboard();
  dashboard.deserialize(legacyExport());

  const doc = dashboard.toDocument();
  assert.equal(doc.schemaVersion, 1);
  assert.equal((doc.generator as Record<string, unknown>).name, "freeboard");
  for (const key of ENVELOPE_KEYS) {
    assert.ok(!(key in doc), `toDocument must not emit envelope key '${key}'`);
  }
  assert.equal(doc.version, undefined);

  const panes = doc.panes as Array<Record<string, unknown>>;
  assert.equal(panes[0].id, "pane-abc", "pane.id mirrors layout.i");
});

test("loadDocument hydrates content but leaves the dashboard unsaved (no envelope)", () => {
  const dashboard = new Dashboard();
  dashboard.loadDocument(migrateDashboardDocument(legacyExport()));

  assert.equal(dashboard.title, "Legacy");
  assert.equal(dashboard.datasources.length, 1);
  assert.equal(dashboard.panes.length, 1);
  // Envelope reset to unsaved/owned defaults — a portable document carries none.
  assert.equal(dashboard._id, null);
  assert.equal(dashboard.shareToken, null);
  assert.deepEqual(dashboard.acl, []);
});

test("document round-trips: toDocument -> migrate -> loadDocument -> toDocument is stable", () => {
  const source = new Dashboard();
  source.deserialize(legacyExport());
  const first = source.toDocument();

  const rebuilt = new Dashboard();
  rebuilt.loadDocument(migrateDashboardDocument(first));
  const second = rebuilt.toDocument();

  assert.deepEqual(second, first);
});
