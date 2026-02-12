import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Dashboard from "../src/models/Dashboard.js";
import DashboardResolvers from "../src/resolvers/Dashboard.js";

const originalMethods = {
  findOne: Dashboard.findOne,
  findOneAndUpdate: Dashboard.findOneAndUpdate,
  findOneAndDelete: Dashboard.findOneAndDelete,
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
});

test("dashboard query denies private dashboard to non-owner", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ published: false }));

  await assert.rejects(
    () =>
      DashboardResolvers.Query.dashboard(
        null,
        { _id: "dash-1" },
        { user: { _id: "someone-else" } }
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

  Dashboard.findOneAndUpdate = (filter, update, options) => {
    receivedFilter = filter;
    receivedUpdate = update;
    receivedOptions = options;
    return asLean(buildDashboardDoc({ title: "Updated" }));
  };

  const context = { user: { _id: "owner-1" } };

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

  assert.deepEqual(receivedFilter, { _id: "dash-1", user: "owner-1" });
  assert.deepEqual(receivedUpdate, {
    $set: { title: "Updated", settings: { theme: "dark" } },
  });
  assert.deepEqual(receivedOptions, { new: true, runValidators: true });
  assert.equal(result.title, "Updated");
  assert.equal(result.isOwner, true);
});

test("deleteDashboard denies deleting non-owned dashboard", async () => {
  Dashboard.findOneAndDelete = () => asLean(null);

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.deleteDashboard(
        null,
        { _id: "dash-1" },
        { user: { _id: "other-user" } }
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
        { user: { _id: "other-user" } }
      ),
    /Dashboard not found/
  );
});
