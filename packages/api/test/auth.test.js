import assert from "node:assert/strict";
import { test } from "node:test";

import { createAuthToken, validateAuthToken } from "../src/auth.js";

test("auth token roundtrip preserves _id claim", async () => {
  const token = createAuthToken("user@example.com", false, true, "user-123");
  const payload = await validateAuthToken(token);

  assert.equal(payload.email, "user@example.com");
  assert.equal(payload._id, "user-123");
  assert.equal(payload.admin, false);
  assert.equal(payload.active, true);
});

test("validateAuthToken rejects invalid token", async () => {
  await assert.rejects(
    () => validateAuthToken("not-a-real-jwt-token"),
    /jwt|token/i
  );
});
