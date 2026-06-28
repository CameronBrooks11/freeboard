import assert from "node:assert/strict";
import test from "node:test";

import { validateDashboardDocument } from "../src/validate.js";
import minimalFixture from "./fixtures/minimal.json";
import fullFixture from "./fixtures/full.json";
import legacyInput from "./fixtures/legacy-input.json";

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

test("additionalProperties path is RFC 6901-escaped for keys with / or ~", () => {
  const result = validateDashboardDocument({ ...validDoc(), "a/b~c": true });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.code === "schema.additionalProperties" && e.path === "/a~1b~0c"),
    JSON.stringify(result.errors),
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

test("semantic warnings do not block import (duplicate title)", () => {
  const result = validateDashboardDocument({
    ...validDoc(),
    datasources: [
      { id: "d1", title: "Temp", type: "http", settings: { url: "https://example.com" } },
      { id: "d2", title: "temp", type: "http", settings: { url: "https://example.com" } },
    ],
    panes: [{ id: "PANE", layout: { i: "PANE" }, widgets: [] }],
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.document, "valid-with-warnings still returns the document");
  assert.ok(codes(result.warnings).includes("semantic.datasourceTitleDuplicate"));
});

test("an unknown widget type warns (renders inert) but does not block import", () => {
  const result = validateDashboardDocument({
    ...validDoc(),
    panes: [
      {
        id: "p1",
        layout: { i: "p1" },
        widgets: [
          { id: "w1", type: "gauge" },
          { id: "w2", type: "totally-made-up" },
        ],
      },
    ],
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.document, "valid-with-warnings still returns the document");
  const unknown = result.warnings.filter((w) => w.code === "manifest.unknownWidgetType");
  assert.equal(unknown.length, 1, "exactly the made-up widget warns");
  assert.equal(unknown[0].path, "/panes/0/widgets/1/type");
  assert.equal(unknown[0].severity, "warning");
});

test("recognized widget types and untyped widgets produce no unknown-type warning", () => {
  const result = validateDashboardDocument({
    ...validDoc(),
    panes: [
      {
        id: "p1",
        layout: { i: "p1" },
        // Every core widget type, plus a typeless and a null-typed widget.
        widgets: [
          { id: "w-base", type: "base" },
          { id: "w-table", type: "table" },
          { id: "w-bar", type: "bar-chart" },
          { id: "w-untyped" },
          { id: "w-null", type: null },
        ],
      },
    ],
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(
    codes(result.warnings).includes("manifest.unknownWidgetType"),
    false,
    "known and untyped widgets never warn",
  );
});

test("pane.id != layout.i is rejected as an error (identity must be unambiguous)", () => {
  const result = validateDashboardDocument({
    ...validDoc(),
    panes: [{ id: "PANE", layout: { i: "other" }, widgets: [] }],
  });
  assert.equal(result.valid, false);
  assert.ok(codes(result.errors).includes("semantic.paneIdLayoutMismatch"));
});

// --- manifest-driven datasource validation (parity with the server rules) ---
const dsCodes = (datasource) =>
  codes(
    validateDashboardDocument({ ...validDoc(), datasources: [{ id: "d1", ...datasource }] }).errors,
  );

test("manifest: unknown datasource type is rejected", () => {
  assert.ok(dsCodes({ type: "json", settings: {} }).includes("manifest.unknownType"));
  assert.ok(
    dsCodes({ type: "http", settings: { url: "x" } }).includes("manifest.unknownType") === false,
  );
});

test("manifest http: url required; method/parser enums (case-insensitive); credentialProfileId non-empty", () => {
  assert.ok(dsCodes({ type: "http", settings: {} }).includes("manifest.settings.required"));
  // method/parser are coerce-compared, so any case passes the enum.
  assert.deepEqual(
    dsCodes({ type: "http", settings: { url: "x", method: "get", parser: "JSON" } }),
    [],
  );
  assert.ok(
    dsCodes({ type: "http", settings: { url: "x", method: "FETCH" } }).includes(
      "manifest.settings.enum",
    ),
  );
  assert.ok(
    dsCodes({ type: "http", settings: { url: "x", credentialProfileId: "  " } }).includes(
      "manifest.settings.nonEmpty",
    ),
  );
  // credentialProfileId is optional when absent.
  assert.deepEqual(dsCodes({ type: "http", settings: { url: "x" } }), []);
});

test("manifest stream: queryParamName required when authPlacement === query (coerced sibling)", () => {
  // lowercase query → required
  assert.ok(
    dsCodes({ type: "sse", settings: { url: "x", authPlacement: "query" } }).includes(
      "manifest.settings.requiredWhen",
    ),
  );
  // UPPERCASE QUERY must still trigger it (the coerce trap)
  assert.ok(
    dsCodes({ type: "sse", settings: { url: "x", authPlacement: "QUERY" } }).includes(
      "manifest.settings.requiredWhen",
    ),
  );
  // header (or absent) does not require it
  assert.deepEqual(dsCodes({ type: "sse", settings: { url: "x", authPlacement: "header" } }), []);
  assert.deepEqual(dsCodes({ type: "sse", settings: { url: "x" } }), []);
  // satisfied when provided
  assert.deepEqual(
    dsCodes({ type: "sse", settings: { url: "x", authPlacement: "query", queryParamName: "t" } }),
    [],
  );
});

test("manifest websocket: protocols must be a string or array (type-checked)", () => {
  assert.deepEqual(dsCodes({ type: "websocket", settings: { url: "x", protocols: "a,b" } }), []);
  assert.deepEqual(dsCodes({ type: "websocket", settings: { url: "x", protocols: ["a"] } }), []);
  assert.ok(
    dsCodes({ type: "websocket", settings: { url: "x", protocols: 5 } }).includes(
      "manifest.settings.type",
    ),
  );
  // Explicit null is rejected too (the server's gate is `!== undefined`, not non-null).
  assert.ok(
    dsCodes({ type: "websocket", settings: { url: "x", protocols: null } }).includes(
      "manifest.settings.type",
    ),
  );
  // Absent protocols is fine.
  assert.deepEqual(dsCodes({ type: "websocket", settings: { url: "x" } }), []);
});

test("manifest mqtt: brokerProfileId/topic required; qos is a 0..1 range; non-finite rejected", () => {
  assert.ok(
    dsCodes({ type: "mqtt", settings: { topic: "t" } }).includes("manifest.settings.required"),
  ); // missing broker
  assert.ok(
    dsCodes({ type: "mqtt", settings: { brokerProfileId: "b" } }).includes(
      "manifest.settings.required",
    ),
  ); // missing topic
  const base = { brokerProfileId: "b", topic: "t" };
  assert.deepEqual(dsCodes({ type: "mqtt", settings: { ...base, qos: 0.5 } }), []); // 0.5 is valid (range, not enum)
  assert.ok(
    dsCodes({ type: "mqtt", settings: { ...base, qos: 2 } }).includes("manifest.settings.range"),
  );
  // non-finite must be rejected (NaN < 0 and NaN > 1 are both false — the trap)
  assert.ok(
    dsCodes({ type: "mqtt", settings: { ...base, qos: "abc" } }).includes(
      "manifest.settings.range",
    ),
  );
  assert.ok(
    dsCodes({ type: "mqtt", settings: { ...base, keepaliveSeconds: 4 } }).includes(
      "manifest.settings.range",
    ),
  );
  assert.deepEqual(dsCodes({ type: "mqtt", settings: { ...base, keepaliveSeconds: 60 } }), []);
});

test("rejects a document over the pane/datasource/widget resource limits", () => {
  const tooManyPanes = validateDashboardDocument({
    ...validDoc(),
    panes: Array.from({ length: 201 }, (_, i) => ({
      id: `p${i}`,
      layout: { i: `p${i}` },
      widgets: [],
    })),
  });
  assert.equal(tooManyPanes.valid, false);
  assert.ok(codes(tooManyPanes.errors).includes("limit.panes"));

  const tooManyDatasources = validateDashboardDocument({
    ...validDoc(),
    datasources: Array.from({ length: 201 }, (_, i) => ({
      id: `d${i}`,
      type: "http",
      settings: { url: "https://example.com" },
    })),
  });
  assert.equal(tooManyDatasources.valid, false);
  assert.ok(codes(tooManyDatasources.errors).includes("limit.datasources"));

  const tooManyWidgets = validateDashboardDocument({
    ...validDoc(),
    panes: Array.from({ length: 3 }, (_, p) => ({
      id: `p${p}`,
      layout: { i: `p${p}` },
      widgets: Array.from({ length: 400 }, (_, w) => ({
        id: `w${p}-${w}`,
        type: "text",
        settings: {},
      })),
    })),
  });
  assert.equal(tooManyWidgets.valid, false);
  assert.ok(codes(tooManyWidgets.errors).includes("limit.widgets"));
});

test("rejects a document nested beyond the depth limit", () => {
  let deep = {};
  let cursor = deep;
  for (let i = 0; i < 40; i += 1) {
    cursor.child = {};
    cursor = cursor.child;
  }
  const result = validateDashboardDocument({
    ...validDoc(),
    settings: { theme: "auto", deep },
  });
  assert.equal(result.valid, false);
  assert.ok(codes(result.errors).includes("limit.depth"));
});

test("non-object input is rejected as input.notObject", () => {
  for (const bad of [null, undefined, 42, "x", [], true]) {
    const result = validateDashboardDocument(bad);
    assert.equal(result.valid, false);
    assert.deepEqual(codes(result.errors), ["input.notObject"]);
  }
});

test("validate never mutates its input (deep-frozen populated input passes)", () => {
  const deepFreeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  const input = deepFreeze({
    schemaVersion: 1,
    title: "Frozen",
    columns: 3,
    width: "md",
    settings: { theme: "auto" },
    datasources: [{ id: "d1", title: "API", type: "http", enabled: true, settings: { url: "x" } }],
    panes: [
      {
        id: "p1",
        title: "Pane",
        layout: { x: 0, y: 0, w: 1, h: 1, i: "p1" },
        widgets: [{ id: "w1", type: "text", settings: {} }],
      },
    ],
  });
  const snapshot = JSON.parse(JSON.stringify(input));
  const result = validateDashboardDocument(input);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(input, snapshot);
});
