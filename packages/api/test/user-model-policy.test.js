import assert from "node:assert/strict";
import { test } from "node:test";

import User from "../src/models/User.js";
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

test("user model rejects invalid email/password at schema validation", () => {
  const user = new User({
    email: "invalid-email",
    password: "weakpass",
  });

  const validationError = user.validateSync();
  assert.ok(validationError);
  assert.ok(validationError.errors.email);
  assert.ok(validationError.errors.password);
});

test("user model accepts valid credentials at schema validation", () => {
  const user = new User({
    email: "valid.user@example.com",
    password: "StrongPass123!",
  });

  const validationError = user.validateSync();
  assert.equal(validationError, undefined);
  assert.equal(user.role, "viewer");
  assert.equal(user.sessionVersion, 0);
});

test("user model rejects unsupported role values", () => {
  const user = new User({
    email: "valid.user@example.com",
    password: "StrongPass123!",
    role: "superadmin",
  });

  const validationError = user.validateSync();
  assert.ok(validationError);
  assert.ok(validationError.errors.role);
});
