import assert from "node:assert/strict";
import test from "node:test";

import { validateDashboardDocument } from "../src/models/dashboardValidation.js";
import minimalFixture from "../../../schema/fixtures/minimal.json";
import fullFixture from "../../../schema/fixtures/full.json";
import legacyInput from "../../../schema/fixtures/legacy-input.json";

/** A fresh, minimal v1 document that is valid as-is. */
const validDoc = () => ({
  schemaVersion: 1,
  title: "Test",
  columns: 3,
  width: "md",
  settings: { theme: "auto" },
  datasources: [],
  panes: [],
});

const codes = (issues) => issues.map((issue) => issue.code);

test("committed fixtures validate (minimal + full)", () => {
  const minimal = validateDashboardDocument(minimalFixture);
  assert.equal(minimal.valid, true, JSON.stringify(minimal.errors));
  assert.deepEqual(minimal.errors, []);

  const full = validateDashboardDocument(fullFixture);
  assert.equal(full.valid, true, JSON.stringify(full.errors));
  assert.deepEqual(full.errors, []);
});

test("legacy-input validates only after the internal migrate", () => {
  const result = validateDashboardDocument(legacyInput);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.document, "valid result carries the migrated document");
  assert.equal(result.document.schemaVersion, 1);
  assert.equal("_id" in result.document, false);
});

test("future schemaVersion is rejected BEFORE migrate can rewrite it", () => {
  const result = validateDashboardDocument({ ...validDoc(), schemaVersion: 2 });
  assert.equal(result.valid, false);
  assert.deepEqual(codes(result.errors), ["version.future"]);
  assert.equal(result.errors[0].path, "/schemaVersion");
  assert.equal(result.document, undefined, "invalid result carries no document");
});

test("malformed schemaVersion (string / float / zero) is rejected", () => {
  for (const bad of ["1", 1.5, 0, -1, true, null]) {
    const result = validateDashboardDocument({ ...validDoc(), schemaVersion: bad });
    assert.equal(result.valid, false, `schemaVersion=${JSON.stringify(bad)} should be invalid`);
    assert.deepEqual(codes(result.errors), ["version.invalid"]);
  }
});

test("absent schemaVersion is treated as legacy and migrated", () => {
  const noVersion = validDoc();
  delete noVersion.schemaVersion;
  const result = validateDashboardDocument(noVersion);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("structural failures map to schema.* with JSON-Pointer paths", () => {
  const missingTitle = validateDashboardDocument({ ...validDoc(), title: undefined });
  assert.equal(missingTitle.valid, false);
  assert.ok(missingTitle.errors.some((e) => e.code === "schema.required" && e.path === "/title"));

  const wrongType = validateDashboardDocument({ ...validDoc(), columns: "three" });
  assert.equal(wrongType.valid, false);
  assert.ok(wrongType.errors.some((e) => e.code === "schema.type" && e.path === "/columns"));

  const badTheme = validateDashboardDocument({ ...validDoc(), settings: { theme: "neon" } });
  assert.ok(badTheme.errors.some((e) => e.code === "schema.enum" && e.path === "/settings/theme"));
});

test("metadata-smuggling: an unknown top-level field is rejected (additionalProperties)", () => {
  // `bogus` is not an envelope key migrate strips, so it reaches the schema.
  const result = validateDashboardDocument({ ...validDoc(), bogus: true });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.code === "schema.additionalProperties" && e.path === "/bogus"),
  );
});

test("semantic errors: duplicate ids and reserved datasource title", () => {
  const dupDs = validateDashboardDocument({
    ...validDoc(),
    datasources: [
      { id: "d1", type: "http", settings: {} },
      { id: "d1", type: "http", settings: {} },
    ],
  });
  assert.ok(
    dupDs.errors.some(
      (e) => e.code === "semantic.datasourceIdDuplicate" && e.path === "/datasources/1/id",
    ),
  );

  const dupWidget = validateDashboardDocument({
    ...validDoc(),
    panes: [
      { id: "p1", layout: { i: "p1" }, widgets: [{ id: "w1" }] },
      { id: "p2", layout: { i: "p2" }, widgets: [{ id: "w1" }] },
    ],
  });
  assert.ok(
    dupWidget.errors.some((e) => e.code === "semantic.widgetIdDuplicate"),
    "duplicate widget id across panes",
  );

  const dupPane = validateDashboardDocument({
    ...validDoc(),
    panes: [
      { id: "p1", layout: { i: "p1" }, widgets: [] },
      { id: "p1", layout: { i: "p1" }, widgets: [] },
    ],
  });
  assert.ok(dupPane.errors.some((e) => e.code === "semantic.paneIdDuplicate"));

  const reserved = validateDashboardDocument({
    ...validDoc(),
    datasources: [{ id: "d1", title: "Datasources", type: "http", settings: {} }],
  });
  assert.ok(reserved.errors.some((e) => e.code === "semantic.datasourceTitleReserved"));
});

test("semantic warnings do not block import (duplicate title, pane.id != layout.i)", () => {
  const result = validateDashboardDocument({
    ...validDoc(),
    datasources: [
      { id: "d1", title: "Temp", type: "http", settings: {} },
      { id: "d2", title: "temp", type: "http", settings: {} },
    ],
    panes: [{ id: "PANE", layout: { i: "other" }, widgets: [] }],
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.document, "valid-with-warnings still returns the document");
  assert.ok(codes(result.warnings).includes("semantic.datasourceTitleDuplicate"));
  assert.ok(codes(result.warnings).includes("semantic.paneIdLayoutMismatch"));
});

test("non-object input is rejected as input.notObject", () => {
  for (const bad of [null, undefined, 42, "x", [], true]) {
    const result = validateDashboardDocument(bad);
    assert.equal(result.valid, false);
    assert.deepEqual(codes(result.errors), ["input.notObject"]);
  }
});

test("validate never mutates its input (deep-frozen input passes)", () => {
  const input = validDoc();
  const snapshot = JSON.parse(JSON.stringify(input));
  Object.freeze(input);
  Object.freeze(input.settings);
  Object.freeze(input.datasources);
  Object.freeze(input.panes);
  const result = validateDashboardDocument(input);
  assert.equal(result.valid, true);
  assert.deepEqual(input, snapshot);
});
