import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuthToken, validateAuthToken } from "../src/auth.js";

test("auth token roundtrip preserves _id claim", async () => {
  const token = createAuthToken("user@example.com", "editor", true, "user-123");
  const payload = await validateAuthToken(token);

  assert.equal(payload.email, "user@example.com");
  assert.equal(payload._id, "user-123");
  assert.equal(payload.role, "editor");
  assert.equal(payload.admin, false);
  assert.equal(payload.active, true);
});

test("validateAuthToken rejects invalid token", async () => {
  await assert.rejects(
    () => validateAuthToken("not-a-real-jwt-token"),
    /jwt|token/i
  );
});

test("auth token sets admin compatibility flag from role", async () => {
  const token = createAuthToken("admin@example.com", "admin", true, "admin-1");
  const payload = await validateAuthToken(token);

  assert.equal(payload.role, "admin");
  assert.equal(payload.admin, true);
});
