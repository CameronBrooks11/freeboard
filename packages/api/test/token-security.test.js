import assert from "node:assert/strict";
import { test } from "node:test";

import { generateOneTimeToken, hashOneTimeToken } from "../src/tokenSecurity.js";

test("generateOneTimeToken returns non-empty URL-safe values", () => {
  const token = generateOneTimeToken();
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 40);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("hashOneTimeToken is deterministic for same token", () => {
  const token = "sample-token-value";
  const hashA = hashOneTimeToken(token);
  const hashB = hashOneTimeToken(token);
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);
});

test("hashOneTimeToken differs for different tokens", () => {
  const hashA = hashOneTimeToken("token-a");
  const hashB = hashOneTimeToken("token-b");
  assert.notEqual(hashA, hashB);
});
