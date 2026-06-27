import assert from "node:assert/strict";
import test from "node:test";

import { transformDashboard } from "../src/resolvers/merge.js";

const buildDoc = (overrides = {}) => ({
  _id: { toString: () => "dash-1" },
  visibility: "private",
  shareToken: "share-token-1",
  shareTokenVersion: 0,
  acl: [],
  document: {
    schemaVersion: 1,
    title: "Main",
    image: null,
    datasources: [],
    columns: 3,
    width: "md",
    panes: [],
    settings: { theme: "auto" },
  },
  user: { toString: () => "owner-1" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

test("transformDashboard includes owner user id", () => {
  const transformed = transformDashboard(buildDoc(), "owner-1");
  assert.equal(transformed.user, "owner-1");
});

test("transformDashboard exposes a derived title from the document", () => {
  assert.equal(transformDashboard(buildDoc(), "owner-1").title, "Main");
  // Falls back to null when the document carries no string title.
  assert.equal(transformDashboard(buildDoc({ document: {} }), "owner-1").title, null);
});

test("transformDashboard derives isOwner from viewer context", () => {
  const ownerView = transformDashboard(buildDoc(), "owner-1", {
    canEdit: true,
    canManageSharing: true,
  });
  const otherView = transformDashboard(buildDoc(), "someone-else", {
    canEdit: false,
    canManageSharing: false,
  });
  const anonymousView = transformDashboard(buildDoc(), null, {
    canEdit: false,
    canManageSharing: false,
  });

  assert.equal(ownerView.isOwner, true);
  assert.equal(ownerView.canEdit, true);
  assert.equal(ownerView.shareToken, "share-token-1");
  assert.equal(ownerView.shareTokenVersion, 0);
  assert.equal(otherView.isOwner, false);
  assert.equal(otherView.canEdit, false);
  assert.equal(otherView.shareToken, null);
  assert.equal(anonymousView.isOwner, false);
});

test("transformDashboard handles populated user object", () => {
  const transformed = transformDashboard(
    buildDoc({ user: { _id: { toString: () => "owner-1" } } }),
    "owner-1",
  );

  assert.equal(transformed.user, "owner-1");
  assert.equal(transformed.isOwner, true);
});
