import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { dataStore } from "../src/data/index.js";
import DashboardResolvers from "../src/resolvers/Dashboard.js";

const dashboards = dataStore.repositories.dashboards;
const policy = dataStore.repositories.policy;
const audit = dataStore.repositories.audit;
const revocation = dataStore.repositories.shareTokenRevocationFeed;

const original = {
  create: dashboards.create,
  updateById: dashboards.updateById,
  findById: dashboards.findById,
  readValue: policy.readValue,
  auditIsReady: audit.isReady,
  revIsReady: revocation.isReady,
  revInsert: revocation.insertEvent,
};

const EDITOR = { user: { _id: "editor-1", role: "editor" } };

const validContent = (overrides = {}) => ({
  schemaVersion: 1,
  title: "Board",
  image: null,
  columns: 3,
  width: "md",
  datasources: [],
  panes: [],
  settings: { theme: "auto" },
  ...overrides,
});

const storedRecord = (overrides = {}) => ({
  _id: "dash-1",
  user: "editor-1",
  visibility: "private",
  shareToken: "tok",
  shareTokenVersion: 0,
  acl: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  document: validContent(),
  ...overrides,
});

const createDashboard = (dashboard) =>
  DashboardResolvers.Mutation.createDashboard(null, { dashboard }, EDITOR);
const updateDashboard = (dashboard) =>
  DashboardResolvers.Mutation.updateDashboard(null, { _id: "dash-1", dashboard }, EDITOR);

beforeEach(() => {
  audit.isReady = () => false;
  revocation.isReady = () => false;
  revocation.insertEvent = async () => {};
  policy.readValue = async ({ key }) =>
    ({
      "app.execution.mode": "safe",
      "dashboard.visibility.default": "private",
      "auth.publish.nonAdminCanPublish": false,
    })[key] ?? null;
  dashboards.create = async (params) => storedRecord({ _id: "created", ...params });
  dashboards.findById = async () => storedRecord();
  dashboards.updateById = async ({ patch }) => storedRecord({ ...patch });
});

afterEach(() => {
  dashboards.create = original.create;
  dashboards.updateById = original.updateById;
  dashboards.findById = original.findById;
  policy.readValue = original.readValue;
  audit.isReady = original.auditIsReady;
  revocation.isReady = original.revIsReady;
  revocation.insertEvent = original.revInsert;
});

test("createDashboard accepts a valid v1 document", async () => {
  const result = await createDashboard({ document: validContent() });
  assert.equal(result._id, "created");
});

test("createDashboard rejects a sparse/invalid document with structured BAD_USER_INPUT", async () => {
  await assert.rejects(
    () => createDashboard({ document: { title: "X" } }),
    (err) => {
      assert.match(String(err.message), /failed validation/);
      assert.equal(err.extensions?.code, "BAD_USER_INPUT");
      const issues = err.extensions?.validationErrors;
      assert.ok(Array.isArray(issues) && issues.length > 0, "carries validationErrors");
      assert.ok(issues.every((i) => i.code && typeof i.path === "string" && i.message));
      return true;
    },
  );
});

test("createDashboard rejects an invalid theme enum", async () => {
  await assert.rejects(
    () => createDashboard({ document: validContent({ settings: { theme: "neon" } }) }),
    (err) =>
      err.extensions?.code === "BAD_USER_INPUT" &&
      err.extensions.validationErrors.some((i) => i.code === "schema.enum"),
  );
});

test("createDashboard treats a duplicate datasource title as a warning, not a rejection", async () => {
  const result = await createDashboard({
    document: validContent({
      datasources: [
        { id: "d1", title: "Temp", type: "http", settings: { url: "https://example.com" } },
        { id: "d2", title: "temp", type: "http", settings: { url: "https://example.com" } },
      ],
    }),
  });
  assert.equal(result._id, "created");
});

test("updateDashboard rejects an invalid replacement document", async () => {
  dashboards.findById = async () => storedRecord();
  // Pass a valid revision so document validation is the only possible failure
  // (keeps this asserting the validation path even if check order changes).
  await assert.rejects(
    () => updateDashboard({ document: validContent({ columns: 2 }), expectedDocumentRevision: 1 }),
    (err) =>
      err.extensions?.code === "BAD_USER_INPUT" && Array.isArray(err.extensions?.validationErrors),
  );
});

test("updateDashboard accepts a valid replacement document", async () => {
  dashboards.findById = async () => storedRecord();
  const result = await updateDashboard({
    document: validContent({ title: "Renamed" }),
    expectedDocumentRevision: 1,
  });
  assert.equal(result._id, "dash-1");
});

test("updateDashboard rejects a document write without expectedDocumentRevision", async () => {
  dashboards.findById = async () => storedRecord();
  await assert.rejects(
    () => updateDashboard({ document: validContent({ title: "NoRev" }) }),
    (err) =>
      err.extensions?.code === "BAD_USER_INPUT" && /expectedDocumentRevision/.test(err.message),
  );
});

test("updateDashboard rejects a document write with a non-positive-integer revision", async () => {
  dashboards.findById = async () => storedRecord();
  for (const bad of [0, -1, 1.5, "1"]) {
    await assert.rejects(
      () =>
        updateDashboard({
          document: validContent({ title: "BadRev" }),
          expectedDocumentRevision: bad,
        }),
      (err) => err.extensions?.code === "BAD_USER_INPUT",
    );
  }
});

test("an envelope-only (visibility) update carries no document and is admitted", async () => {
  dashboards.findById = async () => storedRecord();
  const result = await updateDashboard({ visibility: "private" });
  assert.equal(result._id, "dash-1");
});

test("updateDashboard rejects a combined document + visibility write", async () => {
  dashboards.findById = async () => storedRecord();
  await assert.rejects(
    () => updateDashboard({ document: validContent({ title: "X" }), visibility: "public" }),
    (err) =>
      err.extensions?.code === "BAD_USER_INPUT" && /setDashboardVisibility/.test(err.message),
  );
});

// The datasource shim delegates per-type settings validation to @freeboard/core
// but keeps its own structural guards (it runs on raw input, pre-Ajv).
test("updateDashboard rejects a non-array datasources value (shim structural guard)", async () => {
  dashboards.findById = async () => storedRecord();
  await assert.rejects(
    () => updateDashboard({ document: validContent({ datasources: "nope" }) }),
    (err) => err.extensions?.code === "BAD_USER_INPUT" && /must be an array/.test(err.message),
  );
});

test("updateDashboard rejects a non-object datasource entry (shim structural guard)", async () => {
  dashboards.findById = async () => storedRecord();
  await assert.rejects(
    () => updateDashboard({ document: validContent({ datasources: ["nope"] }) }),
    (err) => err.extensions?.code === "BAD_USER_INPUT" && /must be an object/.test(err.message),
  );
});

test("datasource validation is in-order fail-fast (index-0 settings error precedes a later bad entry)", async () => {
  dashboards.findById = async () => storedRecord();
  await assert.rejects(
    () =>
      updateDashboard({
        document: validContent({
          datasources: [{ id: "d1", type: "http", settings: {} }, "nope"],
        }),
      }),
    // The index-0 url error surfaces first, not the index-1 "must be an object".
    (err) =>
      err.extensions?.code === "BAD_USER_INPUT" && /requires a non-empty url/.test(err.message),
  );
});
