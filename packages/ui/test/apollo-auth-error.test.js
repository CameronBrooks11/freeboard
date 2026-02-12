import assert from "node:assert/strict";
import test from "node:test";

import {
  isAuthGraphQLError,
  shouldForceLogoutOnGraphQLErrors,
} from "../src/apolloAuthError.js";

test("isAuthGraphQLError matches auth extension codes", () => {
  assert.equal(
    isAuthGraphQLError({ message: "boom", extensions: { code: "UNAUTHENTICATED" } }),
    true
  );
  assert.equal(
    isAuthGraphQLError({ message: "boom", extensions: { code: "FORBIDDEN" } }),
    true
  );
});

test("isAuthGraphQLError matches auth-related messages when code is absent", () => {
  assert.equal(isAuthGraphQLError({ message: "Unauthorized request" }), true);
  assert.equal(isAuthGraphQLError({ message: "Validation failed" }), false);
});

test("shouldForceLogoutOnGraphQLErrors returns true only when any auth error exists", () => {
  assert.equal(shouldForceLogoutOnGraphQLErrors(), false);
  assert.equal(shouldForceLogoutOnGraphQLErrors([]), false);
  assert.equal(
    shouldForceLogoutOnGraphQLErrors([{ message: "Validation failed" }]),
    false
  );
  assert.equal(
    shouldForceLogoutOnGraphQLErrors([
      { message: "Validation failed" },
      { message: "forbidden access" },
    ]),
    true
  );
});

