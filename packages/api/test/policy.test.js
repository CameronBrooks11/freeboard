import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeExecutionMode,
  normalizeNonAdminRole,
  normalizeRegistrationMode,
  normalizeRole,
} from "../src/policy.js";

test("normalizeRole accepts known roles", () => {
  assert.equal(normalizeRole("viewer"), "viewer");
  assert.equal(normalizeRole("EDITOR"), "editor");
  assert.equal(normalizeRole(" admin "), "admin");
});

test("normalizeNonAdminRole rejects admin", () => {
  assert.throws(() => normalizeNonAdminRole("admin"), /Invalid non-admin role/);
});

test("normalizeRegistrationMode accepts supported values", () => {
  assert.equal(normalizeRegistrationMode("disabled"), "disabled");
  assert.equal(normalizeRegistrationMode("invite"), "invite");
  assert.equal(normalizeRegistrationMode("OPEN"), "open");
});

test("normalizeExecutionMode accepts safe and trusted", () => {
  assert.equal(normalizeExecutionMode("safe"), "safe");
  assert.equal(normalizeExecutionMode("TRUSTED"), "trusted");
});

test("normalizeExecutionMode rejects unknown value", () => {
  assert.throws(() => normalizeExecutionMode("unsafe"), /Invalid execution mode/);
});
