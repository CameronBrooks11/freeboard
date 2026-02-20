import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { consumeRateLimit, resetRateLimitState } from "../src/rateLimit.js";
import {
  consumeSecurityLimiterFixedWindow,
  getSecurityLimiterMemoryKeys,
  resetSecurityLimiterMemoryState,
} from "../src/securityLimiter.js";

afterEach(() => {
  resetRateLimitState();
  resetSecurityLimiterMemoryState();
});

test("consumeRateLimit enforces fixed-window limits", async () => {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);

  const first = await consumeRateLimit("datasource-mint:user:user-1", 2, start);
  assert.equal(first.allowed, true);
  assert.equal(first.reason, "allowed");
  assert.equal(first.remaining, 1);

  const second = await consumeRateLimit("datasource-mint:user:user-1", 2, start + 1);
  assert.equal(second.allowed, true);
  assert.equal(second.reason, "allowed");
  assert.equal(second.remaining, 0);

  const third = await consumeRateLimit("datasource-mint:user:user-1", 2, start + 2);
  assert.equal(third.allowed, false);
  assert.equal(third.reason, "limited");
  assert.ok(third.retryAfterMs > 0);
});

test("security limiter store keys do not include raw sensitive key material", async () => {
  await consumeSecurityLimiterFixedWindow({
    scope: "test-sensitive",
    keyMaterial: "User@Example.com::share-token-plain-text",
    limit: 10,
    windowMs: 60_000,
    nowMs: Date.UTC(2026, 0, 1, 0, 0, 0),
  });

  const keys = getSecurityLimiterMemoryKeys();
  assert.equal(keys.counterKeys.length > 0, true);
  const firstCounterKey = keys.counterKeys[0] || "";
  assert.equal(firstCounterKey.includes("user@example.com"), false);
  assert.equal(firstCounterKey.includes("share-token-plain-text"), false);
});

test("consumeRateLimit fails open when backend consume fails and mode is fail-open", async () => {
  const failingConsume: typeof import("../src/securityLimiter.js").consumeSecurityLimiterFixedWindow =
    async () => {
      throw new Error("simulated limiter backend failure");
    };
  const decision = await consumeRateLimit("gateway-realtime:connect:203.0.113.10", 5, 0, {
    consumeFixedWindow: failingConsume,
    failureMode: "fail-open",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "backend_fail_open");
});

test("consumeRateLimit fails closed when backend consume fails and mode is fail-closed", async () => {
  const failingConsume: typeof import("../src/securityLimiter.js").consumeSecurityLimiterFixedWindow =
    async () => {
      throw new Error("simulated limiter backend failure");
    };
  const decision = await consumeRateLimit("gateway-realtime:connect:203.0.113.10", 5, 0, {
    consumeFixedWindow: failingConsume,
    failureMode: "fail-closed",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "backend_fail_closed");
});
