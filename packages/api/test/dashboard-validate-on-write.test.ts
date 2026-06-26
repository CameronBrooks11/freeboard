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
  title: "Board",
  version: "1",
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
  ...validContent(),
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
      "auth.publish.editorCanPublish": false,
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
  const result = await createDashboard(validContent());
  assert.equal(result._id, "created");
});

test("createDashboard rejects a sparse/invalid document with structured BAD_USER_INPUT", async () => {
  await assert.rejects(
    () => createDashboard({ title: "X", version: "1" }),
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
    () => createDashboard(validContent({ settings: { theme: "neon" } })),
    (err) =>
      err.extensions?.code === "BAD_USER_INPUT" &&
      err.extensions.validationErrors.some((i) => i.code === "schema.enum"),
  );
});

test("createDashboard treats a duplicate datasource title as a warning, not a rejection", async () => {
  const result = await createDashboard(
    validContent({
      datasources: [
        { id: "d1", title: "Temp", type: "http", settings: { url: "https://example.com" } },
        { id: "d2", title: "temp", type: "http", settings: { url: "https://example.com" } },
      ],
    }),
  );
  assert.equal(result._id, "created");
});

test("updateDashboard rejects an edit that breaks an already-valid document", async () => {
  dashboards.findById = async () => storedRecord();
  await assert.rejects(
    () => updateDashboard({ columns: 2 }),
    (err) => err.extensions?.code === "BAD_USER_INPUT",
  );
});

test("updateDashboard keeps a legacy-invalid dashboard editable", async () => {
  dashboards.findById = async () => storedRecord({ settings: {} });
  const result = await updateDashboard({ title: "Renamed" });
  assert.equal(result._id, "dash-1");
});

test("an envelope-only (visibility) update is not blocked by document validity", async () => {
  dashboards.findById = async () => storedRecord({ settings: {} });
  const result = await updateDashboard({ visibility: "private" });
  assert.equal(result._id, "dash-1");
});

test("a visibility-only update on an already-valid dashboard is admitted (candidate equals stored content)", async () => {
  dashboards.findById = async () => storedRecord();
  const result = await updateDashboard({ visibility: "private" });
  assert.equal(result._id, "dash-1");
});
