import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  buildLoginThrottleKey,
  clearLoginThrottle,
  getLoginThrottleState,
  recordFailedLoginAttempt,
  resetLoginThrottleState,
} from "../src/loginThrottle.js";

afterEach(() => {
  resetLoginThrottleState();
});

test("buildLoginThrottleKey normalizes email and client ip", () => {
  const key = buildLoginThrottleKey("  User@Example.Com  ", " 10.0.0.5 ");
  assert.equal(key, "user@example.com::10.0.0.5");
});

test("recordFailedLoginAttempt locks after configured threshold", () => {
  const key = buildLoginThrottleKey("viewer@example.com", "127.0.0.1");
  const start = Date.now();

  let last = null;
  for (let i = 0; i < 5; i += 1) {
    last = recordFailedLoginAttempt(key, start + i);
  }

  assert.ok(last);
  assert.equal(last.justLocked, true);
  assert.equal(last.blocked, true);
  assert.ok(last.retryAfterMs > 0);

  const state = getLoginThrottleState(key, start + 6);
  assert.equal(state.blocked, true);
  assert.ok(state.retryAfterMs > 0);
});

test("clearLoginThrottle removes active lock state", () => {
  const key = buildLoginThrottleKey("viewer@example.com", "127.0.0.1");
  const start = Date.now();
  for (let i = 0; i < 5; i += 1) {
    recordFailedLoginAttempt(key, start + i);
  }

  clearLoginThrottle(key);
  const state = getLoginThrottleState(key, start + 10);
  assert.equal(state.blocked, false);
  assert.equal(state.retryAfterMs, 0);
});

