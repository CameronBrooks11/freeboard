import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Dashboard from "../src/models/Dashboard.js";
import User from "../src/models/User.js";
import UserResolvers from "../src/resolvers/User.js";

const asLean = (value) => ({
  lean: async () => value,
});

const asSortedLean = (value) => ({
  sort: () => asLean(value),
});

const buildDashboard = (overrides = {}) => ({
  _id: "dash-1",
  user: "target-user",
  visibility: "public",
  shareToken: "legacy-token",
  acl: [{ userId: "target-user", accessLevel: "editor" }],
  ...overrides,
});

const originalMethods = {
  dashboardFind: Dashboard.find,
  dashboardFindOneAndUpdate: Dashboard.findOneAndUpdate,
  userFindOne: User.findOne,
  userFindOneAndDelete: User.findOneAndDelete,
};

afterEach(() => {
  Dashboard.find = originalMethods.dashboardFind;
  Dashboard.findOneAndUpdate = originalMethods.dashboardFindOneAndUpdate;
  User.findOne = originalMethods.userFindOne;
  User.findOneAndDelete = originalMethods.userFindOneAndDelete;
});

test("adminDeleteUser reassigns owned dashboards and removes stale ACL access", async () => {
  const updatedDashboards = [];

  User.findOne = ({ _id }) =>
    asLean(
      _id === "target-user"
        ? {
            _id: "target-user",
            email: "target@example.com",
            role: "editor",
            active: false,
          }
        : null
    );
  User.findOneAndDelete = ({ _id }) =>
    asLean(
      _id === "target-user"
        ? {
            _id: "target-user",
            email: "target@example.com",
            role: "editor",
            active: false,
          }
        : null
    );

  Dashboard.find = () =>
    asLean([
      buildDashboard({
        _id: "dash-owned",
        user: "target-user",
        visibility: "public",
        shareToken: "owned-token",
        acl: [
          { userId: "target-user", accessLevel: "editor" },
          { userId: "admin-1", accessLevel: "viewer" },
          { userId: "viewer-1", accessLevel: "viewer" },
        ],
      }),
      buildDashboard({
        _id: "dash-acl",
        user: "other-owner",
        visibility: "private",
        shareToken: "acl-token",
        acl: [
          { userId: "target-user", accessLevel: "viewer" },
          { userId: "editor-2", accessLevel: "editor" },
        ],
      }),
    ]);
  Dashboard.findOneAndUpdate = (filter, update) => {
    updatedDashboards.push({ filter, update });
    return asLean({
      _id: filter._id,
      ...buildDashboard(),
      ...update.$set,
    });
  };

  const result = await UserResolvers.Mutation.adminDeleteUser(
    null,
    { _id: "target-user" },
    { user: { _id: "admin-1", role: "admin", active: true } }
  );

  assert.equal(result._id, "target-user");
  assert.equal(updatedDashboards.length, 2);

  const ownedUpdate = updatedDashboards.find(
    (entry) => entry.filter._id === "dash-owned"
  );
  assert.ok(ownedUpdate);
  assert.equal(ownedUpdate.update.$set.user, "admin-1");
  assert.equal(ownedUpdate.update.$set.visibility, "private");
  assert.equal(typeof ownedUpdate.update.$set.shareToken, "string");
  assert.ok(ownedUpdate.update.$set.shareToken.length > 0);
  assert.deepEqual(ownedUpdate.update.$set.acl, [
    { userId: "viewer-1", accessLevel: "viewer" },
  ]);

  const aclOnlyUpdate = updatedDashboards.find(
    (entry) => entry.filter._id === "dash-acl"
  );
  assert.ok(aclOnlyUpdate);
  assert.deepEqual(aclOnlyUpdate.update.$set.acl, [
    { userId: "editor-2", accessLevel: "editor" },
  ]);
});

test("adminDeleteUser rejects permanent deletion for active users", async () => {
  User.findOne = ({ _id }) =>
    asLean(
      _id === "target-user"
        ? {
            _id: "target-user",
            email: "target@example.com",
            role: "viewer",
            active: true,
          }
        : null
    );

  await assert.rejects(
    () =>
      UserResolvers.Mutation.adminDeleteUser(
        null,
        { _id: "target-user" },
        { user: { _id: "admin-1", role: "admin", active: true } }
      ),
    /Deactivate the user account before permanent deletion/
  );
});

test("deleteMyUserAccount blocks removal when no fallback admin exists for owned dashboards", async () => {
  User.findOne = (filter) => {
    if (filter._id === "editor-1") {
      return asLean({
        _id: "editor-1",
        email: "editor@example.com",
        role: "editor",
        active: true,
      });
    }
    if (filter.role === "admin") {
      return asSortedLean(null);
    }
    return asLean(null);
  };

  Dashboard.find = () =>
    asLean([
      buildDashboard({
        _id: "dash-owned",
        user: "editor-1",
        acl: [],
      }),
    ]);

  await assert.rejects(
    () =>
      UserResolvers.Mutation.deleteMyUserAccount(
        null,
        {},
        { user: { _id: "editor-1", role: "editor", active: true } }
      ),
    /active administrator recovery owner/
  );
});
