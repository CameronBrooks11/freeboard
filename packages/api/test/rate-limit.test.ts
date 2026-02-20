import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { consumeRateLimit, resetRateLimitState } from "../src/rateLimit.js";
import { getApiRuntimeMetricsSnapshot } from "../src/runtimeMetrics.js";
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

test("consumeRateLimit records limiter allow/reject metrics counters", async () => {
  const before = getApiRuntimeMetricsSnapshot();
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);

  const allowed = await consumeRateLimit("metrics:rate-limit", 1, start);
  const rejected = await consumeRateLimit("metrics:rate-limit", 1, start + 1);
  const after = getApiRuntimeMetricsSnapshot();

  assert.equal(allowed.allowed, true);
  assert.equal(rejected.allowed, false);
  assert.equal(after.limiterAllowedCount - before.limiterAllowedCount >= 1, true);
  assert.equal(after.limiterRejectedCount - before.limiterRejectedCount >= 1, true);
});

const createSharedFixedWindowAdapter = (): typeof consumeSecurityLimiterFixedWindow => {
  const counters = new Map<string, { bucketId: number; count: number }>();

  return async ({ scope, keyMaterial, limit, windowMs, nowMs = Date.now() }) => {
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
    const safeWindowMs = Math.max(1000, Math.floor(Number(windowMs) || 1000));
    const bucketId = Math.floor(nowMs / safeWindowMs);
    const key = `${String(scope || "")}:${String(keyMaterial || "")}`;
    const current = counters.get(key);
    const nextCount = current && current.bucketId === bucketId ? current.count + 1 : 1;
    counters.set(key, { bucketId, count: nextCount });

    const resetAtMs = (bucketId + 1) * safeWindowMs;
    const allowed = nextCount <= safeLimit;
    if (allowed) {
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.max(0, safeLimit - nextCount),
        resetAtMs,
      };
    }

    return {
      allowed: false,
      retryAfterMs: Math.max(1, resetAtMs - nowMs),
      remaining: 0,
      resetAtMs,
    };
  };
};

const loadRateLimitInstance = async (label: string) =>
  import(`../src/rateLimit.js?instance=${label}-${Date.now()}-${Math.random()}`);

test("shared limiter adapter continuity survives multi-instance and restart simulation", async () => {
  const sharedAdapter = createSharedFixedWindowAdapter();
  const instanceA = await loadRateLimitInstance("a");
  const instanceB = await loadRateLimitInstance("b");
  const restartedInstance = await loadRateLimitInstance("restart");
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);

  const first = await instanceA.consumeRateLimit("datasource-mint:public-ip:shared-ip", 2, start, {
    consumeFixedWindow: sharedAdapter,
  });
  const second = await instanceB.consumeRateLimit(
    "datasource-mint:public-ip:shared-ip",
    2,
    start + 1,
    {
      consumeFixedWindow: sharedAdapter,
    },
  );
  const third = await restartedInstance.consumeRateLimit(
    "datasource-mint:public-ip:shared-ip",
    2,
    start + 2,
    {
      consumeFixedWindow: sharedAdapter,
    },
  );

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.reason, "limited");
});
