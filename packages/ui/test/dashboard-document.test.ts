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

// The server record the load path receives: envelope columns + a nested document.
const serverRecord = () => {
  const {
    version: _version,
    _id,
    visibility,
    shareToken,
    shareTokenVersion,
    acl,
    isOwner,
    canEdit,
    canManageSharing,
    ...content
  } = legacyExport();
  return {
    _id,
    visibility,
    shareToken,
    shareTokenVersion,
    acl,
    isOwner,
    canEdit,
    canManageSharing,
    document: content,
  };
};

test("migrate strips envelope fields, drops the legacy version, stamps schemaVersion", () => {
  const doc = migrateDashboardDocument(legacyExport());

  for (const key of ENVELOPE_KEYS) {
    assert.ok(!(key in doc), `envelope key '${key}' must not survive migration`);
  }
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.version, undefined);
  // No legacy version->generator upgrade.
  assert.equal(doc.generator, undefined);
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
  dashboard.deserialize(serverRecord());

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

test("deserialize reads documentRevision from the record; loadDocument resets it to 1", () => {
  const saved = new Dashboard();
  saved.deserialize({ ...serverRecord(), documentRevision: 6 });
  assert.equal(saved.documentRevision, 6);

  // A portable document is unsaved and carries no server revision.
  const portable = new Dashboard();
  portable.loadDocument(migrateDashboardDocument(legacyExport()));
  assert.equal(portable.documentRevision, 1);
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

test("pane.id is real runtime state, preserved across the load round-trip", () => {
  const record = serverRecord();
  // A document whose pane carries the canonical id (layout.i mirrors it).
  record.document.panes = [
    {
      id: "P-canonical",
      title: "Pane",
      layout: { x: 0, y: 0, w: 1, h: 1, i: "P-canonical" },
      widgets: [],
    },
  ];

  const dashboard = new Dashboard();
  dashboard.deserialize(record);

  // The runtime now stores the canonical id; it used to drop it on load and
  // rebuild a (possibly different) id from layout.i.
  assert.equal(dashboard.panes[0].id, "P-canonical");

  const doc = dashboard.toDocument();
  const panes = doc.panes as Array<Record<string, unknown>>;
  assert.equal(panes[0].id, "P-canonical");
  assert.equal((panes[0].layout as Record<string, unknown>).i, "P-canonical");
});

test("document round-trips: toDocument -> migrate -> loadDocument -> toDocument is stable", () => {
  const source = new Dashboard();
  source.deserialize(serverRecord());
  const first = source.toDocument();

  const rebuilt = new Dashboard();
  rebuilt.loadDocument(migrateDashboardDocument(first));
  const second = rebuilt.toDocument();

  assert.deepEqual(second, first);
});
