import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Dashboard from "../src/models/Dashboard.js";
import Policy from "../src/models/Policy.js";
import DashboardResolvers from "../src/resolvers/Dashboard.js";

const originalMethods = {
  findOne: Dashboard.findOne,
  findOneAndUpdate: Dashboard.findOneAndUpdate,
  findOneAndDelete: Dashboard.findOneAndDelete,
  policyFindOne: Policy.findOne,
};

const asLean = (value) => ({
  lean: async () => value,
});

const buildDashboardDoc = (overrides = {}) => ({
  _id: "dash-1",
  version: "1",
  title: "Main",
  published: false,
  image: null,
  datasources: [],
  columns: 3,
  width: "md",
  panes: [],
  authProviders: [],
  settings: {},
  user: "owner-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

afterEach(() => {
  Dashboard.findOne = originalMethods.findOne;
  Dashboard.findOneAndUpdate = originalMethods.findOneAndUpdate;
  Dashboard.findOneAndDelete = originalMethods.findOneAndDelete;
  Policy.findOne = originalMethods.policyFindOne;
});

test("dashboard query denies private dashboard to non-owner", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ published: false }));

  await assert.rejects(
    () =>
      DashboardResolvers.Query.dashboard(
        null,
        { _id: "dash-1" },
        { user: { _id: "someone-else", role: "viewer" } }
      ),
    /Dashboard not found/
  );
});

test("dashboard query allows published dashboard for anonymous user", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ published: true }));

  const result = await DashboardResolvers.Query.dashboard(
    null,
    { _id: "dash-1" },
    {}
  );

  assert.equal(result._id, "dash-1");
  assert.equal(result.title, "Main");
  assert.equal(result.published, true);
  assert.equal(result.user, "owner-1");
  assert.equal(result.isOwner, false);
});

test("updateDashboard scopes update by owner and strips immutable fields", async () => {
  let receivedFilter = null;
  let receivedUpdate = null;
  let receivedOptions = null;

  Dashboard.findOne = () => asLean(buildDashboardDoc({ user: "owner-1" }));

  Dashboard.findOneAndUpdate = (filter, update, options) => {
    receivedFilter = filter;
    receivedUpdate = update;
    receivedOptions = options;
    return asLean(buildDashboardDoc({ title: "Updated" }));
  };

  const context = { user: { _id: "owner-1", role: "editor" } };

  const result = await DashboardResolvers.Mutation.updateDashboard(
    null,
    {
      _id: "dash-1",
      dashboard: {
        title: "Updated",
        user: "hijack-attempt",
        settings: { theme: "dark" },
      },
    },
    context
  );

  assert.deepEqual(receivedFilter, { _id: "dash-1" });
  assert.deepEqual(receivedUpdate, {
    $set: { title: "Updated", settings: { theme: "dark" } },
  });
  assert.deepEqual(receivedOptions, { new: true, runValidators: true });
  assert.equal(result.title, "Updated");
  assert.equal(result.isOwner, true);
});

test("deleteDashboard denies deleting non-owned dashboard", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ user: "owner-1" }));
  Dashboard.findOneAndDelete = () => asLean(null);

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.deleteDashboard(
        null,
        { _id: "dash-1" },
        { user: { _id: "other-user", role: "editor" } }
      ),
    /Dashboard not found/
  );
});

test("dashboard subscription denies non-owner", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ user: "owner-1" }));

  await assert.rejects(
    () =>
      DashboardResolvers.Subscription.dashboard.subscribe(
        null,
        { _id: "dash-1" },
        { user: { _id: "other-user", role: "editor" } }
      ),
    /Dashboard not found/
  );
});

test("createDashboard rejects viewer role", async () => {
  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.createDashboard(
        null,
        {
          dashboard: buildDashboardDoc(),
        },
        {
          user: { _id: "viewer-1", role: "viewer" },
        }
      ),
    /do not have access/i
  );
});

test("admin updateDashboard can edit another user's dashboard", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ user: "owner-1" }));
  Dashboard.findOneAndUpdate = () =>
    asLean(buildDashboardDoc({ title: "Updated by admin", user: "owner-1" }));

  const result = await DashboardResolvers.Mutation.updateDashboard(
    null,
    {
      _id: "dash-1",
      dashboard: { title: "Updated by admin" },
    },
    { user: { _id: "admin-1", role: "admin" } }
  );

  assert.equal(result.title, "Updated by admin");
  assert.equal(result.user, "owner-1");
  assert.equal(result.isOwner, false);
});

test("editor can update already-published dashboard without toggling publish state", async () => {
  const policyValues = {
    "auth.publish.editorCanPublish": false,
  };
  Policy.findOne = ({ key }) =>
    asLean(
      Object.prototype.hasOwnProperty.call(policyValues, key)
        ? { key, value: policyValues[key] }
        : null
    );

  Dashboard.findOne = () =>
    asLean(buildDashboardDoc({ user: "owner-1", published: true }));
  Dashboard.findOneAndUpdate = () =>
    asLean(
      buildDashboardDoc({
        user: "owner-1",
        published: true,
        title: "Edited without publish toggle",
      })
    );

  const result = await DashboardResolvers.Mutation.updateDashboard(
    null,
    {
      _id: "dash-1",
      dashboard: { title: "Edited without publish toggle", published: true },
    },
    { user: { _id: "owner-1", role: "editor" } }
  );

  assert.equal(result.title, "Edited without publish toggle");
  assert.equal(result.published, true);
});

test("editor cannot toggle publish state when policy disallows publishing", async () => {
  const policyValues = {
    "auth.publish.editorCanPublish": false,
  };
  Policy.findOne = ({ key }) =>
    asLean(
      Object.prototype.hasOwnProperty.call(policyValues, key)
        ? { key, value: policyValues[key] }
        : null
    );

  Dashboard.findOne = () =>
    asLean(buildDashboardDoc({ user: "owner-1", published: false }));
  Dashboard.findOneAndUpdate = () =>
    asLean(
      buildDashboardDoc({
        user: "owner-1",
        published: true,
      })
    );

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.updateDashboard(
        null,
        {
          _id: "dash-1",
          dashboard: { published: true },
        },
        { user: { _id: "owner-1", role: "editor" } }
      ),
    /Editors are not allowed to publish dashboards/
  );
});
