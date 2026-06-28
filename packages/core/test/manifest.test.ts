import assert from "node:assert/strict";
import test from "node:test";

// Import from the BARREL to also prove the value-export works (no Ajv pulled in).
import { PLUGIN_MANIFEST, getManifestEntry, RESOURCE_LIMITS } from "../src/index.js";
import type { ManifestField } from "../src/index.js";

const ds = (typeName: string) => getManifestEntry("datasource", typeName);
const field = (typeName: string, name: string): ManifestField => {
  const entry = ds(typeName);
  assert.ok(entry, `datasource '${typeName}' must exist in the manifest`);
  const f = entry.fields.find((x) => x.name === name);
  assert.ok(f, `datasource '${typeName}' must declare settings field '${name}'`);
  return f;
};

test("manifest covers exactly the six allowed datasource types", () => {
  const types = PLUGIN_MANIFEST.filter((e) => e.kind === "datasource")
    .map((e) => e.typeName)
    .sort();
  assert.deepEqual(types, ["clock", "http", "mqtt", "sse", "static", "websocket"]);
});

test("manifest covers the twelve core widgets (discovery-only: profile-agnostic, no fields)", () => {
  const widgets = PLUGIN_MANIFEST.filter((e) => e.kind === "widget");
  assert.deepEqual(widgets.map((e) => e.typeName).sort(), [
    "bar-chart",
    "base",
    "gauge",
    "html",
    "indicator",
    "map",
    "picture",
    "pointer",
    "sparkline",
    "status-list",
    "table",
    "text",
  ]);
  // Every widget is available in both builds and carries no validated settings yet.
  for (const widget of widgets) {
    assert.deepEqual(widget.profiles, ["lite", "server"], `${widget.typeName} is profile-agnostic`);
    assert.deepEqual(widget.fields, [], `${widget.typeName} has no field rules yet`);
  }
});

test("build-profile availability matches the runtime (gateway-only types are server-only)", () => {
  for (const t of ["http", "clock", "static"]) {
    assert.deepEqual(ds(t)?.profiles, ["lite", "server"], `${t} is available in both builds`);
  }
  for (const t of ["sse", "websocket", "mqtt"]) {
    assert.deepEqual(ds(t)?.profiles, ["server"], `${t} is server-only`);
  }
});

test("http entry reproduces the server rules", () => {
  assert.equal(field("http", "url").required, true);
  const method = field("http", "method");
  assert.deepEqual(method.enum, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  assert.equal(method.coerce, "upper");
  assert.equal(method.required ?? false, false);
  const parser = field("http", "parser");
  assert.deepEqual(parser.enum, ["json", "text", "csv"]);
  assert.equal(parser.coerce, "lower");
  const cred = field("http", "credentialProfileId");
  assert.equal(cred.nonEmpty, true);
  assert.equal(cred.required ?? false, false);
  assert.equal(cred.ref, "credentialProfile");
});

test("clock and static carry no settings rules", () => {
  assert.deepEqual(ds("clock")?.fields, []);
  assert.deepEqual(ds("static")?.fields, []);
});

for (const stream of ["sse", "websocket"]) {
  test(`${stream} entry reproduces the server stream rules`, () => {
    assert.equal(field(stream, "url").required, true);
    assert.deepEqual(field(stream, "parser").enum, ["json", "text"]);
    assert.equal(field(stream, "parser").coerce, "lower");
    assert.deepEqual(field(stream, "authPlacement").enum, ["header", "query"]);
    assert.equal(field(stream, "authPlacement").coerce, "lower");
    assert.deepEqual(field(stream, "queryParamName").requiredWhen, {
      field: "authPlacement",
      equals: "query",
    });
    assert.equal(field(stream, "credentialProfileId").nonEmpty, true);
    assert.equal(field(stream, "credentialProfileId").ref, "credentialProfile");
  });
}

test("websocket additionally type-checks protocols (string or array)", () => {
  const protocols = field("websocket", "protocols");
  assert.deepEqual(protocols.dataType, ["string", "array"]);
  assert.equal(protocols.typeCheck, true);
  // sse has no protocols field.
  assert.equal(
    ds("sse")?.fields.some((f) => f.name === "protocols"),
    false,
  );
});

test("mqtt entry reproduces the server rules (qos is a 0..1 range, not an enum)", () => {
  assert.equal(field("mqtt", "brokerProfileId").required, true);
  assert.equal(field("mqtt", "brokerProfileId").ref, "brokerProfile");
  assert.equal(field("mqtt", "topic").required, true);
  assert.deepEqual(field("mqtt", "parser").enum, ["json", "text"]);
  const qos = field("mqtt", "qos");
  assert.equal(qos.dataType, "number");
  assert.equal(qos.min, 0);
  assert.equal(qos.max, 1);
  assert.equal(qos.enum, undefined);
  const keepalive = field("mqtt", "keepaliveSeconds");
  assert.equal(keepalive.min, 5);
  assert.equal(keepalive.max, 3600);
});

test("only websocket.protocols is type-checked (server parity: url/qos/etc. are coerced, not type-checked)", () => {
  const typeChecked = PLUGIN_MANIFEST.flatMap((e) =>
    e.fields.filter((f) => f.typeCheck).map((f) => `${e.typeName}.${f.name}`),
  );
  assert.deepEqual(typeChecked, ["websocket.protocols"]);
});

test("getManifestEntry resolves by kind+type and is undefined for unknowns", () => {
  assert.equal(getManifestEntry("datasource", "http")?.typeName, "http");
  assert.equal(getManifestEntry("datasource", "nope"), undefined);
  assert.equal(getManifestEntry("widget", "http"), undefined); // right type, wrong kind
});

test("resource limits are exposed with the enforced values", () => {
  assert.deepEqual(RESOURCE_LIMITS, {
    maxDatasources: 200,
    maxPanes: 200,
    maxWidgets: 1000,
    maxNestingDepth: 32,
  });
});
