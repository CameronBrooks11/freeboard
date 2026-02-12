import assert from "node:assert/strict";
import test from "node:test";

import {
  applyShareMutationPayloadToDashboard,
  getCollaboratorInputError,
  getOwnershipTransferInputError,
  getShareMutationGuardError,
  resolveShareDialogPermissions,
} from "../src/shareDialogPolicy.js";

test("resolveShareDialogPermissions allows unsaved local dashboard management", () => {
  const result = resolveShareDialogPermissions({
    isSaved: false,
    dashboard: {
      _id: "",
      canManageSharing: false,
    },
  });

  assert.deepEqual(result, {
    isShareableDashboard: false,
    canManageSharing: true,
  });
});

test("resolveShareDialogPermissions enforces server canManageSharing on saved dashboards", () => {
  const result = resolveShareDialogPermissions({
    isSaved: true,
    dashboard: {
      _id: "dash-1",
      canManageSharing: false,
    },
  });

  assert.deepEqual(result, {
    isShareableDashboard: true,
    canManageSharing: false,
  });
});

test("getShareMutationGuardError reports save-before-share and permission issues", () => {
  assert.equal(
    getShareMutationGuardError({
      isShareableDashboard: false,
      canManageSharing: true,
    }),
    "Save the dashboard before configuring sharing."
  );

  assert.equal(
    getShareMutationGuardError({
      isShareableDashboard: true,
      canManageSharing: false,
    }),
    "You do not have permission to manage sharing."
  );

  assert.equal(
    getShareMutationGuardError({
      isShareableDashboard: true,
      canManageSharing: true,
    }),
    null
  );
});

test("input validators enforce collaborator email and ownership transfer target", () => {
  assert.equal(
    getCollaboratorInputError({ collaboratorEmail: "   " }),
    "Collaborator email is required."
  );
  assert.equal(
    getCollaboratorInputError({ collaboratorEmail: "user@example.com" }),
    null
  );

  assert.equal(
    getOwnershipTransferInputError({ transferTargetUserId: "" }),
    "Select a transfer target first."
  );
  assert.equal(
    getOwnershipTransferInputError({ transferTargetUserId: "user-2" }),
    null
  );
});

test("applyShareMutationPayloadToDashboard updates visibility/token/permissions", () => {
  const dashboard = {
    visibility: "private",
    shareToken: "token-1",
    canEdit: true,
    canManageSharing: true,
    user: "owner-1",
    acl: [],
  };

  const applied = applyShareMutationPayloadToDashboard({
    dashboard,
    payload: {
      visibility: "link",
      shareToken: "token-2",
      canEdit: false,
      canManageSharing: false,
      user: "owner-2",
      acl: [{ userId: "viewer-1", accessLevel: "viewer" }],
    },
  });

  assert.equal(applied, true);
  assert.deepEqual(dashboard, {
    visibility: "link",
    shareToken: "token-2",
    canEdit: false,
    canManageSharing: false,
    user: "owner-2",
    acl: [{ userId: "viewer-1", accessLevel: "viewer" }],
  });
});

test("applyShareMutationPayloadToDashboard no-ops when payload or dashboard missing", () => {
  assert.equal(
    applyShareMutationPayloadToDashboard({
      dashboard: null,
      payload: { visibility: "public" },
    }),
    false
  );
  assert.equal(
    applyShareMutationPayloadToDashboard({
      dashboard: { visibility: "private" },
      payload: null,
    }),
    false
  );
});
