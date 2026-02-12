import assert from "node:assert/strict";
import test from "node:test";

import { transformDashboard } from "../src/resolvers/merge.js";

const buildDoc = (overrides = {}) => ({
  _id: { toString: () => "dash-1" },
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
  user: { toString: () => "owner-1" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

test("transformDashboard includes owner user id", () => {
  const transformed = transformDashboard(buildDoc(), "owner-1");
  assert.equal(transformed.user, "owner-1");
});

test("transformDashboard derives isOwner from viewer context", () => {
  const ownerView = transformDashboard(buildDoc(), "owner-1");
  const otherView = transformDashboard(buildDoc(), "someone-else");
  const anonymousView = transformDashboard(buildDoc(), null);

  assert.equal(ownerView.isOwner, true);
  assert.equal(otherView.isOwner, false);
  assert.equal(anonymousView.isOwner, false);
});

test("transformDashboard handles populated user object", () => {
  const transformed = transformDashboard(
    buildDoc({ user: { _id: { toString: () => "owner-1" } } }),
    "owner-1"
  );

  assert.equal(transformed.user, "owner-1");
  assert.equal(transformed.isOwner, true);
});
