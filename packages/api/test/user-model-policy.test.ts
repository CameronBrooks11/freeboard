import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeRole } from "../src/policy.js";
import { isStrongPassword, isValidEmail, normalizeEmail } from "../src/validators.js";

test("email validator accepts standard normalized address", () => {
  assert.equal(isValidEmail("User.Name+tag@example.com"), true);
  assert.equal(normalizeEmail("  User.Name+tag@example.com "), "user.name+tag@example.com");
});

test("email validator rejects malformed address", () => {
  assert.equal(isValidEmail("invalid-email"), false);
  assert.equal(isValidEmail("name@localhost"), false);
});

test("password validator enforces strong policy", () => {
  assert.equal(isStrongPassword("weakpassword"), false);
  assert.equal(isStrongPassword("StrongPass123!"), true);
});

test("normalizeRole accepts supported role values", () => {
  assert.equal(normalizeRole("viewer"), "viewer");
  assert.equal(normalizeRole(" Editor "), "editor");
  assert.equal(normalizeRole("ADMIN"), "admin");
});

test("normalizeRole rejects unsupported role values", () => {
  assert.throws(() => normalizeRole("superadmin"), /Invalid role/);
});
