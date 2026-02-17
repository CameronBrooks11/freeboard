import assert from "node:assert/strict";
import test from "node:test";

import { resolveDashboardIsOwner } from "../src/models/ownership.js";

test("resolveDashboardIsOwner prefers explicit API flag", () => {
  assert.equal(resolveDashboardIsOwner({ user: "owner-1", isOwner: false }), false);
  assert.equal(resolveDashboardIsOwner({ user: "owner-1", isOwner: true }), true);
});

test("resolveDashboardIsOwner falls back to legacy user-based behavior", () => {
  assert.equal(resolveDashboardIsOwner({ user: "owner-1" }), false);
  assert.equal(resolveDashboardIsOwner({ user: null }), true);
  assert.equal(resolveDashboardIsOwner({}), true);
});
