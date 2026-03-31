import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { dataStore } from "../src/data/index.js";
import UserResolvers from "../src/resolvers/User.js";

const dashboardRepository = dataStore.repositories.dashboards;
const userRepository = dataStore.repositories.users;

const buildDashboard = (overrides = {}) => ({
  _id: "dash-1",
  user: "target-user",
  visibility: "public",
  shareToken: "legacy-token",
  acl: [{ userId: "target-user", accessLevel: "editor" }],
  ...overrides,
});

const originalMethods = {
  dashboardFindImpactedByUserId: dashboardRepository.findImpactedByUserId,
  dashboardUpdateById: dashboardRepository.updateById,
  userFindById: userRepository.findById,
  userDeleteById: userRepository.deleteById,
  userFindFirstActiveAdmin: userRepository.findFirstActiveAdmin,
};

afterEach(() => {
  dashboardRepository.findImpactedByUserId = originalMethods.dashboardFindImpactedByUserId;
  dashboardRepository.updateById = originalMethods.dashboardUpdateById;
  userRepository.findById = originalMethods.userFindById;
  userRepository.deleteById = originalMethods.userDeleteById;
  userRepository.findFirstActiveAdmin = originalMethods.userFindFirstActiveAdmin;
});

test("adminDeleteUser reassigns owned dashboards and removes stale ACL access", async () => {
  const updatedDashboards = [];

  userRepository.findById = async ({ userId }) =>
    userId === "target-user"
      ? {
          _id: "target-user",
          email: "target@example.com",
          role: "editor",
          active: false,
          password: "ignored",
          sessionVersion: 0,
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          lastLogin: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;
  userRepository.deleteById = async ({ userId }) =>
    userId === "target-user"
      ? {
          _id: "target-user",
          email: "target@example.com",
          role: "editor",
          active: false,
          password: "ignored",
          sessionVersion: 0,
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          lastLogin: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;

  dashboardRepository.findImpactedByUserId = async () => [
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
  ];
  dashboardRepository.updateById = async ({ dashboardId, patch }) => {
    updatedDashboards.push({ dashboardId, patch });
    return {
      _id: dashboardId,
      ...buildDashboard(),
      ...patch,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  };

  const result = await UserResolvers.Mutation.adminDeleteUser(
    null,
    { _id: "target-user" },
    { user: { _id: "admin-1", role: "admin", active: true } },
  );

  assert.equal(result._id, "target-user");
  assert.equal(updatedDashboards.length, 2);

  const ownedUpdate = updatedDashboards.find((entry) => entry.dashboardId === "dash-owned");
  assert.ok(ownedUpdate);
  assert.equal(ownedUpdate.patch.user, "admin-1");
  assert.equal(ownedUpdate.patch.visibility, "private");
  assert.equal(typeof ownedUpdate.patch.shareToken, "string");
  assert.ok(String(ownedUpdate.patch.shareToken).length > 0);
  assert.deepEqual(ownedUpdate.patch.acl, [{ userId: "viewer-1", accessLevel: "viewer" }]);

  const aclOnlyUpdate = updatedDashboards.find((entry) => entry.dashboardId === "dash-acl");
  assert.ok(aclOnlyUpdate);
  assert.deepEqual(aclOnlyUpdate.patch.acl, [{ userId: "editor-2", accessLevel: "editor" }]);
});

test("adminDeleteUser rejects permanent deletion for active users", async () => {
  userRepository.findById = async ({ userId }) =>
    userId === "target-user"
      ? {
          _id: "target-user",
          email: "target@example.com",
          role: "viewer",
          active: true,
          password: "ignored",
          sessionVersion: 0,
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          lastLogin: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;

  await assert.rejects(
    () =>
      UserResolvers.Mutation.adminDeleteUser(
        null,
        { _id: "target-user" },
        { user: { _id: "admin-1", role: "admin", active: true } },
      ),
    /Deactivate the user account before permanent deletion/,
  );
});

test("deleteMyUserAccount blocks removal when no fallback admin exists for owned dashboards", async () => {
  userRepository.findById = async ({ userId }) =>
    userId === "editor-1"
      ? {
          _id: "editor-1",
          email: "editor@example.com",
          role: "editor",
          active: true,
          password: "ignored",
          sessionVersion: 0,
          registrationDate: new Date("2026-01-01T00:00:00.000Z"),
          lastLogin: new Date("2026-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
      : null;
  userRepository.findFirstActiveAdmin = async () => null;

  dashboardRepository.findImpactedByUserId = async () => [
    buildDashboard({
      _id: "dash-owned",
      user: "editor-1",
      acl: [],
    }),
  ];

  await assert.rejects(
    () =>
      UserResolvers.Mutation.deleteMyUserAccount(
        null,
        {},
        { user: { _id: "editor-1", role: "editor", active: true } },
      ),
    /active administrator recovery owner/,
  );
});
