import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Dashboard from "../src/models/Dashboard.js";
import Policy from "../src/models/Policy.js";
import User from "../src/models/User.js";
import DashboardResolvers from "../src/resolvers/Dashboard.js";

const originalMethods = {
  dashboardFind: Dashboard.find,
  dashboardFindOne: Dashboard.findOne,
  dashboardFindOneAndUpdate: Dashboard.findOneAndUpdate,
  dashboardFindOneAndDelete: Dashboard.findOneAndDelete,
  dashboardPrototypeSave: Dashboard.prototype.save,
  policyFindOne: Policy.findOne,
  userFindOne: User.findOne,
};

const asLean = (value) => ({
  lean: async () => value,
});

const buildDashboardDoc = (overrides = {}) => ({
  _id: "dash-1",
  version: "1",
  title: "Main",
  visibility: "private",
  shareToken: "share-token-1",
  acl: [],
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

const stubPolicyValues = (overrides = {}) => {
  const defaults = {
    "auth.registration.mode": "disabled",
    "auth.registration.defaultRole": "viewer",
    "auth.publish.editorCanPublish": false,
    "dashboard.visibility.default": "private",
    "dashboard.listing.public.enabled": false,
    "app.execution.mode": "safe",
  };
  const values = { ...defaults, ...overrides };

  Policy.findOne = ({ key }) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      return asLean(null);
    }
    return asLean({ key, value: values[key] });
  };
};

afterEach(() => {
  Dashboard.find = originalMethods.dashboardFind;
  Dashboard.findOne = originalMethods.dashboardFindOne;
  Dashboard.findOneAndUpdate = originalMethods.dashboardFindOneAndUpdate;
  Dashboard.findOneAndDelete = originalMethods.dashboardFindOneAndDelete;
  Dashboard.prototype.save = originalMethods.dashboardPrototypeSave;
  Policy.findOne = originalMethods.policyFindOne;
  User.findOne = originalMethods.userFindOne;
});

test("dashboard query denies private dashboard to non-owner", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ visibility: "private" }));

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

test("dashboard query allows public dashboard for anonymous user", async () => {
  Dashboard.findOne = () => asLean(buildDashboardDoc({ visibility: "public" }));

  const result = await DashboardResolvers.Query.dashboard(
    null,
    { _id: "dash-1" },
    {}
  );

  assert.equal(result._id, "dash-1");
  assert.equal(result.visibility, "public");
  assert.equal(result.isOwner, false);
  assert.equal(result.canEdit, false);
  assert.equal(result.shareToken, null);
});

test("dashboardByShareToken allows anonymous link access", async () => {
  Dashboard.findOne = ({ shareToken }) =>
    asLean(
      shareToken === "token-1"
        ? buildDashboardDoc({ visibility: "link", shareToken: "token-1" })
        : null
    );

  const result = await DashboardResolvers.Query.dashboardByShareToken(
    null,
    { shareToken: "token-1" },
    {}
  );

  assert.equal(result._id, "dash-1");
  assert.equal(result.visibility, "link");
});

test("dashboardByShareToken denies private dashboard to anonymous user", async () => {
  Dashboard.findOne = () =>
    asLean(buildDashboardDoc({ visibility: "private", shareToken: "token-1" }));

  await assert.rejects(
    () =>
      DashboardResolvers.Query.dashboardByShareToken(
        null,
        { shareToken: "token-1" },
        {}
      ),
    /Dashboard not found/
  );
});

test("updateDashboard allows acl editor and strips immutable fields", async () => {
  let receivedUpdate = null;
  Dashboard.findOne = () =>
    asLean(
      buildDashboardDoc({
        user: "owner-1",
        acl: [{ userId: "editor-1", accessLevel: "editor" }],
      })
    );
  Dashboard.findOneAndUpdate = (filter, update) => {
    assert.deepEqual(filter, { _id: "dash-1" });
    receivedUpdate = update;
    return asLean(
      buildDashboardDoc({
        title: "Updated",
        acl: [{ userId: "editor-1", accessLevel: "editor" }],
      })
    );
  };

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
    { user: { _id: "editor-1", role: "editor" } }
  );

  assert.deepEqual(receivedUpdate, {
    $set: { title: "Updated", settings: { theme: "dark" } },
  });
  assert.equal(result.title, "Updated");
  assert.equal(result.canEdit, true);
  assert.equal(result.isOwner, false);
});

test("deleteDashboard allows acl editor collaborator", async () => {
  Dashboard.findOne = () =>
    asLean(
      buildDashboardDoc({
        user: "owner-1",
        acl: [{ userId: "editor-1", accessLevel: "editor" }],
      })
    );
  Dashboard.findOneAndDelete = (filter) => {
    assert.deepEqual(filter, { _id: "dash-1" });
    return asLean(
      buildDashboardDoc({
        user: "owner-1",
        acl: [{ userId: "editor-1", accessLevel: "editor" }],
      })
    );
  };

  const result = await DashboardResolvers.Mutation.deleteDashboard(
    null,
    { _id: "dash-1" },
    { user: { _id: "editor-1", role: "editor" } }
  );

  assert.equal(result._id, "dash-1");
  assert.equal(result.canEdit, true);
});

test("setDashboardVisibility rejects external visibility when publish policy disabled", async () => {
  stubPolicyValues({
    "auth.publish.editorCanPublish": false,
  });
  Dashboard.findOne = () => asLean(buildDashboardDoc({ visibility: "private" }));

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.setDashboardVisibility(
        null,
        { _id: "dash-1", visibility: "public" },
        { user: { _id: "owner-1", role: "editor" } }
      ),
    /Editors are not allowed to publish dashboards/
  );
});

test("setDashboardVisibility allows reducing exposure to private even when publish policy disabled", async () => {
  stubPolicyValues({
    "auth.publish.editorCanPublish": false,
  });
  Dashboard.findOne = () => asLean(buildDashboardDoc({ visibility: "public" }));
  Dashboard.findOneAndUpdate = () =>
    asLean(buildDashboardDoc({ visibility: "private" }));

  const result = await DashboardResolvers.Mutation.setDashboardVisibility(
    null,
    { _id: "dash-1", visibility: "private" },
    { user: { _id: "owner-1", role: "editor" } }
  );

  assert.equal(result.visibility, "private");
});

test("createDashboard falls back to private when default visibility is external and editor cannot publish", async () => {
  stubPolicyValues({
    "dashboard.visibility.default": "public",
    "auth.publish.editorCanPublish": false,
  });

  Dashboard.prototype.save = async function saveStub() {
    return { _id: "dash-created" };
  };
  Dashboard.findOne = ({ _id }) =>
    asLean(
      _id === "dash-created"
        ? buildDashboardDoc({
            _id: "dash-created",
            user: "editor-1",
            visibility: "private",
          })
        : null
    );

  const result = await DashboardResolvers.Mutation.createDashboard(
    null,
    {
      dashboard: {
        title: "Ops",
        version: "1",
      },
    },
    { user: { _id: "editor-1", role: "editor" } }
  );

  assert.equal(result.visibility, "private");
});

test("dashboards query includes public dashboards only when listing policy enabled", async () => {
  stubPolicyValues({
    "dashboard.listing.public.enabled": true,
  });

  Dashboard.find = (filter) => {
    assert.deepEqual(filter, {
      $or: [
        { user: "viewer-1" },
        { acl: { $elemMatch: { userId: "viewer-1" } } },
        { visibility: "public" },
      ],
    });
    return asLean([
      buildDashboardDoc({ _id: "owned", user: "viewer-1", visibility: "private" }),
      buildDashboardDoc({ _id: "public-1", user: "other-user", visibility: "public" }),
    ]);
  };

  const result = await DashboardResolvers.Query.dashboards(
    null,
    {},
    { user: { _id: "viewer-1", role: "viewer" } }
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].visibility, "private");
  assert.equal(result[1].visibility, "public");
});

test("transferDashboardOwnership assigns previous owner editor ACL", async () => {
  Dashboard.findOne = ({ _id }) =>
    asLean(
      _id === "dash-1"
        ? buildDashboardDoc({
            _id: "dash-1",
            user: "owner-1",
            acl: [{ userId: "viewer-2", accessLevel: "viewer" }],
          })
        : null
    );
  User.findOne = ({ _id }) =>
    asLean(_id === "new-owner" ? { _id: "new-owner", active: true } : null);
  Dashboard.findOneAndUpdate = (filter, update) => {
    assert.deepEqual(filter, { _id: "dash-1" });
    assert.equal(update.$set.user, "new-owner");
    assert.ok(
      update.$set.acl.some(
        (entry) =>
          entry.userId === "owner-1" && entry.accessLevel === "editor"
      )
    );
    return asLean(
      buildDashboardDoc({
        _id: "dash-1",
        user: "new-owner",
        acl: update.$set.acl,
      })
    );
  };

  const result = await DashboardResolvers.Mutation.transferDashboardOwnership(
    null,
    { _id: "dash-1", newOwnerUserId: "new-owner" },
    { user: { _id: "owner-1", role: "editor" } }
  );

  assert.equal(result.user, "new-owner");
  assert.equal(result.isOwner, false);
  assert.equal(result.canEdit, true);
});

test("transferDashboardOwnership rejects acl editor who is not owner", async () => {
  Dashboard.findOne = () =>
    asLean(
      buildDashboardDoc({
        user: "owner-1",
        acl: [{ userId: "editor-1", accessLevel: "editor" }],
      })
    );

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.transferDashboardOwnership(
        null,
        { _id: "dash-1", newOwnerUserId: "new-owner" },
        { user: { _id: "editor-1", role: "editor" } }
      ),
    /Dashboard not found/
  );
});
