import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { dataStore } from "../src/data/index.js";
import { DashboardRevisionConflictError } from "../src/data/contracts.js";
import DashboardResolvers from "../src/resolvers/Dashboard.js";

const dashboardRepository = dataStore.repositories.dashboards;
const userRepository = dataStore.repositories.users;
const policyRepository = dataStore.repositories.policy;
const auditRepository = dataStore.repositories.audit;
const revocationRepository = dataStore.repositories.shareTokenRevocationFeed;

const originalMethods = {
  dashboardFindById: dashboardRepository.findById,
  dashboardFindByShareToken: dashboardRepository.findByShareToken,
  dashboardUpdateById: dashboardRepository.updateById,
  dashboardDeleteById: dashboardRepository.deleteById,
  dashboardCreate: dashboardRepository.create,
  dashboardListAccessible: dashboardRepository.listAccessible,
  dashboardListAll: dashboardRepository.listAll,
  userFindByEmail: userRepository.findByEmail,
  userFindByIds: userRepository.findByIds,
  userFindActiveById: userRepository.findActiveById,
  policyReadValue: policyRepository.readValue,
  auditIsReady: auditRepository.isReady,
  revocationIsReady: revocationRepository.isReady,
  revocationInsertEvent: revocationRepository.insertEvent,
};

const buildContent = (overrides = {}) => ({
  schemaVersion: 1,
  title: "Main",
  image: null,
  columns: 3,
  width: "md",
  datasources: [],
  panes: [],
  settings: { theme: "auto" },
  ...overrides,
});

const buildDashboardDoc = (overrides = {}) => {
  const { document: documentOverride, ...envelope } = overrides;
  return {
    _id: "dash-1",
    visibility: "private",
    shareToken: "share-token-1",
    shareTokenVersion: 0,
    acl: [],
    user: "owner-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    document: buildContent(documentOverride),
    ...envelope,
  };
};

const buildUser = (overrides = {}) => ({
  _id: "user-1",
  email: "user@example.com",
  password: "ignored",
  role: "viewer",
  active: true,
  sessionVersion: 0,
  registrationDate: new Date("2026-01-01T00:00:00.000Z"),
  lastLogin: new Date("2026-01-01T00:00:00.000Z"),
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

  policyRepository.readValue = async ({ key }) => values[key] ?? null;
};

beforeEach(() => {
  auditRepository.isReady = () => false;
  revocationRepository.isReady = () => false;
  revocationRepository.insertEvent = async () => {};
});

afterEach(() => {
  dashboardRepository.findById = originalMethods.dashboardFindById;
  dashboardRepository.findByShareToken = originalMethods.dashboardFindByShareToken;
  dashboardRepository.updateById = originalMethods.dashboardUpdateById;
  dashboardRepository.deleteById = originalMethods.dashboardDeleteById;
  dashboardRepository.create = originalMethods.dashboardCreate;
  dashboardRepository.listAccessible = originalMethods.dashboardListAccessible;
  dashboardRepository.listAll = originalMethods.dashboardListAll;
  userRepository.findByEmail = originalMethods.userFindByEmail;
  userRepository.findByIds = originalMethods.userFindByIds;
  userRepository.findActiveById = originalMethods.userFindActiveById;
  policyRepository.readValue = originalMethods.policyReadValue;
  auditRepository.isReady = originalMethods.auditIsReady;
  revocationRepository.isReady = originalMethods.revocationIsReady;
  revocationRepository.insertEvent = originalMethods.revocationInsertEvent;
});

test("dashboard query denies private dashboard to non-owner", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc({ visibility: "private" });

  await assert.rejects(
    () =>
      DashboardResolvers.Query.dashboard(
        null,
        { _id: "dash-1" },
        { user: { _id: "someone-else", role: "viewer" } },
      ),
    /Dashboard not found/,
  );
});

test("dashboard query allows public dashboard for anonymous user", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc({ visibility: "public" });

  const result = await DashboardResolvers.Query.dashboard(null, { _id: "dash-1" }, {});

  assert.equal(result._id, "dash-1");
  assert.equal(result.visibility, "public");
  assert.equal(result.isOwner, false);
  assert.equal(result.canEdit, false);
  assert.equal(result.shareToken, null);
});

test("dashboardByShareToken allows anonymous link access", async () => {
  dashboardRepository.findByShareToken = async ({ shareToken }) =>
    shareToken === "token-1"
      ? buildDashboardDoc({ visibility: "link", shareToken: "token-1" })
      : null;

  const result = await DashboardResolvers.Query.dashboardByShareToken(
    null,
    { shareToken: "token-1" },
    {},
  );

  assert.equal(result._id, "dash-1");
  assert.equal(result.visibility, "link");
});

test("dashboardByShareToken denies private dashboard to anonymous user", async () => {
  dashboardRepository.findByShareToken = async () =>
    buildDashboardDoc({ visibility: "private", shareToken: "token-1" });

  await assert.rejects(
    () => DashboardResolvers.Query.dashboardByShareToken(null, { shareToken: "token-1" }, {}),
    /Dashboard not found/,
  );
});

test("updateDashboard allows acl editor and strips immutable fields", async () => {
  let receivedPatch = null;
  const replacementDocument = buildContent({ title: "Updated", settings: { theme: "dark" } });
  dashboardRepository.findById = async () =>
    buildDashboardDoc({
      user: "owner-1",
      acl: [{ userId: "editor-1", accessLevel: "editor" }],
    });
  dashboardRepository.updateById = async ({ dashboardId, patch }) => {
    assert.equal(dashboardId, "dash-1");
    receivedPatch = patch;
    return buildDashboardDoc({
      document: replacementDocument,
      acl: [{ userId: "editor-1", accessLevel: "editor" }],
    });
  };

  const result = await DashboardResolvers.Mutation.updateDashboard(
    null,
    {
      _id: "dash-1",
      dashboard: {
        document: replacementDocument,
        expectedDocumentRevision: 1,
        user: "hijack-attempt",
      },
    },
    { user: { _id: "editor-1", role: "editor" } },
  );

  assert.deepEqual(receivedPatch, {
    document: replacementDocument,
  });
  assert.equal(result.document.title, "Updated");
  assert.equal(result.canEdit, true);
  assert.equal(result.isOwner, false);
});

test("updateDashboard forwards expectedDocumentRevision to the repository", async () => {
  let receivedExpected;
  dashboardRepository.findById = async () => buildDashboardDoc({ user: "owner-1" });
  dashboardRepository.updateById = async ({ expectedDocumentRevision }) => {
    receivedExpected = expectedDocumentRevision;
    return buildDashboardDoc({ user: "owner-1" });
  };

  await DashboardResolvers.Mutation.updateDashboard(
    null,
    {
      _id: "dash-1",
      dashboard: { document: buildContent({ title: "Edited" }), expectedDocumentRevision: 7 },
    },
    { user: { _id: "owner-1", role: "editor" } },
  );

  assert.equal(receivedExpected, 7);
});

test("updateDashboard surfaces a stale revision as a CONFLICT error", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc({ user: "owner-1" });
  dashboardRepository.updateById = async () => {
    throw new DashboardRevisionConflictError(5);
  };

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.updateDashboard(
        null,
        {
          _id: "dash-1",
          dashboard: { document: buildContent({ title: "Edited" }), expectedDocumentRevision: 1 },
        },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    (error) => {
      assert.match(String(error.message), /changed since you loaded it/);
      assert.equal(error.extensions?.code, "CONFLICT");
      assert.equal(error.extensions?.currentRevision, 5);
      return true;
    },
  );
});

test("createDashboard rejects legacy json datasource type", async () => {
  stubPolicyValues();

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.createDashboard(
        null,
        {
          dashboard: {
            document: buildContent({
              title: "Invalid",
              datasources: [
                {
                  id: "ds-1",
                  title: "Legacy",
                  type: "json",
                  settings: { url: "https://example.com/data.json" },
                },
              ],
            }),
          },
        },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    /Datasource type 'json' is not supported/,
  );
});

test("updateDashboard rejects http datasource without URL", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc();

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.updateDashboard(
        null,
        {
          _id: "dash-1",
          dashboard: {
            document: buildContent({
              datasources: [
                {
                  id: "ds-1",
                  type: "http",
                  settings: {
                    method: "GET",
                  },
                },
              ],
            }),
          },
        },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    /requires a non-empty settings\.url/,
  );
});

test("updateDashboard rejects websocket query auth without queryParamName", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc();

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.updateDashboard(
        null,
        {
          _id: "dash-1",
          dashboard: {
            document: buildContent({
              datasources: [
                {
                  id: "ds-ws-1",
                  type: "websocket",
                  settings: {
                    url: "wss://example.com/stream",
                    parser: "json",
                    authPlacement: "query",
                  },
                },
              ],
            }),
          },
        },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    /requires settings\.queryParamName/,
  );
});

test("updateDashboard rejects mqtt datasource without brokerProfileId", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc();

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.updateDashboard(
        null,
        {
          _id: "dash-1",
          dashboard: {
            document: buildContent({
              datasources: [
                {
                  id: "ds-mqtt-1",
                  type: "mqtt",
                  settings: {
                    topic: "devices/temp",
                    qos: 1,
                  },
                },
              ],
            }),
          },
        },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    /requires a non-empty settings\.brokerProfileId/,
  );
});

test("deleteDashboard denies acl editor collaborator (delete is owner-only)", async () => {
  dashboardRepository.findById = async () =>
    buildDashboardDoc({
      user: "owner-1",
      acl: [{ userId: "editor-1", accessLevel: "editor" }],
    });
  dashboardRepository.deleteById = async () => {
    throw new Error("deleteById must not be reached for a non-owner editor");
  };

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.deleteDashboard(
        null,
        { _id: "dash-1" },
        { user: { _id: "editor-1", role: "editor" } },
      ),
    /Dashboard not found/,
  );
});

test("deleteDashboard allows the owner", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc({ user: "owner-1" });
  dashboardRepository.deleteById = async ({ dashboardId }) => {
    assert.equal(dashboardId, "dash-1");
    return buildDashboardDoc({ user: "owner-1" });
  };

  const result = await DashboardResolvers.Mutation.deleteDashboard(
    null,
    { _id: "dash-1" },
    { user: { _id: "owner-1", role: "editor" } },
  );

  assert.equal(result._id, "dash-1");
  assert.equal(result.isOwner, true);
});

test("deleteDashboard allows an admin who is not the owner", async () => {
  dashboardRepository.findById = async () => buildDashboardDoc({ user: "owner-1" });
  dashboardRepository.deleteById = async () => buildDashboardDoc({ user: "owner-1" });

  const result = await DashboardResolvers.Mutation.deleteDashboard(
    null,
    { _id: "dash-1" },
    { user: { _id: "admin-9", role: "admin" } },
  );

  assert.equal(result._id, "dash-1");
});

test("setDashboardVisibility rejects external visibility when publish policy disabled", async () => {
  stubPolicyValues({
    "auth.publish.editorCanPublish": false,
  });
  dashboardRepository.findById = async () => buildDashboardDoc({ visibility: "private" });

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.setDashboardVisibility(
        null,
        { _id: "dash-1", visibility: "public" },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    /Editors are not allowed to publish dashboards/,
  );
});

test("setDashboardVisibility allows reducing exposure to private even when publish policy disabled", async () => {
  stubPolicyValues({
    "auth.publish.editorCanPublish": false,
  });
  dashboardRepository.findById = async () => buildDashboardDoc({ visibility: "public" });
  dashboardRepository.updateById = async ({ patch }) => buildDashboardDoc({ ...patch });

  const result = await DashboardResolvers.Mutation.setDashboardVisibility(
    null,
    { _id: "dash-1", visibility: "private" },
    { user: { _id: "owner-1", role: "editor" } },
  );

  assert.equal(result.visibility, "private");
});

test("setDashboardVisibility to private immediately revokes share-token access", async () => {
  let dashboardState = buildDashboardDoc({
    _id: "dash-1",
    user: "owner-1",
    visibility: "link",
    shareToken: "token-1",
  });
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1" ? dashboardState : null;
  dashboardRepository.findByShareToken = async ({ shareToken }) =>
    shareToken === "token-1" ? dashboardState : null;
  dashboardRepository.updateById = async ({ patch }) => {
    dashboardState = {
      ...dashboardState,
      ...patch,
    };
    return dashboardState;
  };

  const updated = await DashboardResolvers.Mutation.setDashboardVisibility(
    null,
    { _id: "dash-1", visibility: "private" },
    { user: { _id: "owner-1", role: "editor" } },
  );
  assert.equal(updated.visibility, "private");

  await assert.rejects(
    () => DashboardResolvers.Query.dashboardByShareToken(null, { shareToken: "token-1" }, {}),
    /Dashboard not found/,
  );
});

test("upsertDashboardAccess allows acl editor collaborator to grant viewer access", async () => {
  let dashboardState = buildDashboardDoc({
    _id: "dash-1",
    user: "owner-1",
    acl: [{ userId: "editor-1", accessLevel: "editor" }],
  });
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1" ? dashboardState : null;
  userRepository.findByEmail = async ({ email }) =>
    email === "viewer@example.com"
      ? buildUser({
          _id: "viewer-2",
          email: "viewer@example.com",
          active: true,
        })
      : null;
  dashboardRepository.updateById = async ({ dashboardId, patch }) => {
    assert.equal(dashboardId, "dash-1");
    assert.ok(
      patch.acl.some((entry) => entry.userId === "viewer-2" && entry.accessLevel === "viewer"),
    );
    dashboardState = {
      ...dashboardState,
      ...patch,
    };
    return dashboardState;
  };

  const result = await DashboardResolvers.Mutation.upsertDashboardAccess(
    null,
    { _id: "dash-1", email: "viewer@example.com", accessLevel: "viewer" },
    { user: { _id: "editor-1", role: "editor" } },
  );

  assert.ok(
    result.acl.some((entry) => entry.userId === "viewer-2" && entry.accessLevel === "viewer"),
  );
  assert.equal(result.canManageSharing, true);
});

test("dashboardCollaborators allows acl editor collaborator", async () => {
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1"
      ? buildDashboardDoc({
          _id: "dash-1",
          user: "owner-1",
          acl: [{ userId: "editor-1", accessLevel: "editor" }],
        })
      : null;
  userRepository.findByIds = async () => [
    buildUser({ _id: "owner-1", email: "owner@example.com" }),
    buildUser({ _id: "editor-1", email: "editor@example.com" }),
  ];

  const result = await DashboardResolvers.Query.dashboardCollaborators(
    null,
    { _id: "dash-1" },
    { user: { _id: "editor-1", role: "editor" } },
  );

  assert.equal(result.length, 2);
  assert.ok(result.some((entry) => entry.isOwner && entry.userId === "owner-1"));
  assert.ok(
    result.some(
      (entry) => !entry.isOwner && entry.userId === "editor-1" && entry.accessLevel === "editor",
    ),
  );
});

test("createDashboard falls back to private when default visibility is external and editor cannot publish", async () => {
  stubPolicyValues({
    "dashboard.visibility.default": "public",
    "auth.publish.editorCanPublish": false,
  });

  dashboardRepository.create = async (params) =>
    buildDashboardDoc({
      _id: "dash-created",
      user: String(params.user),
      visibility: String(params.visibility || "private"),
      document: params.document,
    });

  const result = await DashboardResolvers.Mutation.createDashboard(
    null,
    {
      dashboard: {
        document: buildContent({ title: "Ops" }),
      },
    },
    { user: { _id: "editor-1", role: "editor" } },
  );

  assert.equal(result.visibility, "private");
});

test("createDashboard rejects trusted dashboard settings while execution mode is safe", async () => {
  stubPolicyValues({
    "app.execution.mode": "safe",
  });

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.createDashboard(
        null,
        {
          dashboard: {
            document: buildContent({
              title: "Ops",
              settings: {
                theme: "auto",
                script: "window.alert('x')",
              },
            }),
          },
        },
        { user: { _id: "editor-1", role: "editor" } },
      ),
    /Trusted dashboard settings require execution mode 'trusted'/,
  );
});

test("updateDashboard rejects trusted widget capability changes while execution mode is safe", async () => {
  stubPolicyValues({
    "app.execution.mode": "safe",
  });
  const existing = buildDashboardDoc({
    _id: "dash-1",
    user: "owner-1",
    document: buildContent({
      panes: [
        {
          id: "p-1",
          layout: { i: "p-1" },
          widgets: [
            {
              id: "w-html",
              type: "html",
              settings: {
                mode: "text",
              },
            },
          ],
        },
      ],
    }),
  });
  dashboardRepository.findById = async () => existing;

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.updateDashboard(
        null,
        {
          _id: "dash-1",
          dashboard: {
            document: buildContent({
              panes: [
                {
                  id: "p-1",
                  layout: { i: "p-1" },
                  widgets: [
                    {
                      id: "w-html",
                      type: "html",
                      settings: {
                        mode: "trusted_html",
                      },
                    },
                  ],
                },
              ],
            }),
          },
        },
        { user: { _id: "owner-1", role: "editor" } },
      ),
    /Trusted widget capabilities require execution mode 'trusted'/,
  );
});

test("dashboards query includes public dashboards only when listing policy enabled", async () => {
  stubPolicyValues({
    "dashboard.listing.public.enabled": true,
  });

  dashboardRepository.listAccessible = async ({ viewerUserId, includePublic }) => {
    assert.equal(viewerUserId, "viewer-1");
    assert.equal(includePublic, true);
    return [
      buildDashboardDoc({ _id: "owned", user: "viewer-1", visibility: "private" }),
      buildDashboardDoc({ _id: "public-1", user: "other-user", visibility: "public" }),
    ];
  };

  const result = await DashboardResolvers.Query.dashboards(
    null,
    {},
    { user: { _id: "viewer-1", role: "viewer" } },
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].visibility, "private");
  assert.equal(result[1].visibility, "public");
});

test("setDashboardVisibility rotates existing share token when re-exposing from private", async () => {
  stubPolicyValues({
    "auth.publish.editorCanPublish": true,
  });
  let dashboardState = buildDashboardDoc({
    _id: "dash-1",
    user: "owner-1",
    visibility: "private",
    shareToken: "legacy-share-token",
  });
  dashboardRepository.findById = async () => dashboardState;
  dashboardRepository.updateById = async ({ patch }) => {
    dashboardState = {
      ...dashboardState,
      ...patch,
    };
    return dashboardState;
  };

  const result = await DashboardResolvers.Mutation.setDashboardVisibility(
    null,
    { _id: "dash-1", visibility: "link" },
    { user: { _id: "owner-1", role: "editor" } },
  );

  assert.equal(result.visibility, "link");
  assert.ok(result.shareToken);
  assert.notEqual(result.shareToken, "legacy-share-token");
});

test("transferDashboardOwnership assigns previous owner editor ACL", async () => {
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1"
      ? buildDashboardDoc({
          _id: "dash-1",
          user: "owner-1",
          acl: [{ userId: "viewer-2", accessLevel: "viewer" }],
        })
      : null;
  userRepository.findActiveById = async ({ userId }) =>
    userId === "new-owner" ? buildUser({ _id: "new-owner", active: true }) : null;
  dashboardRepository.updateById = async ({ dashboardId, patch }) => {
    assert.equal(dashboardId, "dash-1");
    assert.equal(patch.user, "new-owner");
    assert.ok(
      patch.acl.some((entry) => entry.userId === "owner-1" && entry.accessLevel === "editor"),
    );
    return buildDashboardDoc({
      _id: "dash-1",
      user: "new-owner",
      acl: patch.acl,
    });
  };

  const result = await DashboardResolvers.Mutation.transferDashboardOwnership(
    null,
    { _id: "dash-1", newOwnerUserId: "new-owner" },
    { user: { _id: "owner-1", role: "editor" } },
  );

  assert.equal(result.user, "new-owner");
  assert.equal(result.isOwner, false);
  assert.equal(result.canEdit, true);
});

test("transferDashboardOwnership rejects acl editor who is not owner", async () => {
  dashboardRepository.findById = async () =>
    buildDashboardDoc({
      user: "owner-1",
      acl: [{ userId: "editor-1", accessLevel: "editor" }],
    });

  await assert.rejects(
    () =>
      DashboardResolvers.Mutation.transferDashboardOwnership(
        null,
        { _id: "dash-1", newOwnerUserId: "new-owner" },
        { user: { _id: "editor-1", role: "editor" } },
      ),
    /Dashboard not found/,
  );
});

// Let the pubSub Repeater register its listener before a mutation publishes.
const flushEventLoop = async () => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test(
  "dashboard subscription re-projects per subscriber and never relays the actor's view",
  { timeout: 5000 },
  async () => {
    let dashboardState = buildDashboardDoc({
      _id: "dash-1",
      user: "owner-1",
      visibility: "public",
      shareToken: "owner-secret-token",
      shareTokenVersion: 1,
      acl: [{ userId: "collab-1", accessLevel: "viewer" }],
    });
    dashboardRepository.findById = async ({ dashboardId }) =>
      dashboardId === "dash-1" ? dashboardState : null;
    dashboardRepository.updateById = async ({ patch }) => {
      dashboardState = { ...dashboardState, ...patch };
      return dashboardState;
    };

    const iterator = await DashboardResolvers.Subscription.dashboard.subscribe(
      null,
      { _id: "dash-1" },
      { user: { _id: "viewer-9", role: "viewer" } },
    );
    try {
      const nextEvent = iterator.next();
      await flushEventLoop();

      // The OWNER rotates the share token; the mutation publishes a change event.
      await DashboardResolvers.Mutation.rotateDashboardShareToken(
        null,
        { _id: "dash-1" },
        { user: { _id: "owner-1", role: "editor" } },
      );

      const { value, done } = await nextEvent;
      assert.equal(done, false);
      const projected = value.dashboard;
      assert.equal(projected._id, "dash-1");
      // The viewer receives THEIR projection, not the owner's: no share token,
      // no ACL, no ownership/sharing flags.
      assert.equal(projected.isOwner, false);
      assert.equal(projected.canEdit, false);
      assert.equal(projected.canManageSharing, false);
      assert.equal(projected.shareToken, null);
      assert.deepEqual(projected.acl, []);
    } finally {
      await iterator.return?.();
    }
  },
);

test(
  "dashboard subscription closes when the subscriber's access is revoked mid-stream",
  { timeout: 5000 },
  async () => {
    let dashboardState = buildDashboardDoc({
      _id: "dash-1",
      user: "owner-1",
      visibility: "private",
      acl: [{ userId: "collab-7", accessLevel: "viewer" }],
    });
    dashboardRepository.findById = async ({ dashboardId }) =>
      dashboardId === "dash-1" ? dashboardState : null;
    dashboardRepository.updateById = async ({ patch }) => {
      dashboardState = { ...dashboardState, ...patch };
      return dashboardState;
    };

    const iterator = await DashboardResolvers.Subscription.dashboard.subscribe(
      null,
      { _id: "dash-1" },
      { user: { _id: "collab-7", role: "viewer" } },
    );
    try {
      const nextEvent = iterator.next();
      await flushEventLoop();

      // The owner revokes the collaborator, then the change event fires.
      await DashboardResolvers.Mutation.revokeDashboardAccess(
        null,
        { _id: "dash-1", userId: "collab-7" },
        { user: { _id: "owner-1", role: "editor" } },
      );

      // The now-unauthorized subscriber's stream ends instead of delivering it.
      const { done } = await nextEvent;
      assert.equal(done, true);
    } finally {
      await iterator.return?.();
    }
  },
);

test("dashboard subscription closes when the dashboard is deleted", { timeout: 5000 }, async () => {
  let deleted = false;
  const dashboardState = buildDashboardDoc({
    _id: "dash-1",
    user: "owner-1",
    visibility: "public",
  });
  dashboardRepository.findById = async ({ dashboardId }) =>
    dashboardId === "dash-1" && !deleted ? dashboardState : null;
  dashboardRepository.deleteById = async () => {
    deleted = true;
    return dashboardState;
  };

  const iterator = await DashboardResolvers.Subscription.dashboard.subscribe(
    null,
    { _id: "dash-1" },
    { user: { _id: "viewer-9", role: "viewer" } },
  );
  try {
    const nextEvent = iterator.next();
    await flushEventLoop();

    await DashboardResolvers.Mutation.deleteDashboard(
      null,
      { _id: "dash-1" },
      { user: { _id: "owner-1", role: "editor" } },
    );

    const { done } = await nextEvent;
    assert.equal(done, true);
  } finally {
    await iterator.return?.();
  }
});
