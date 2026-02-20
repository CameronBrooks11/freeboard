/**
 * @module rateLimit
 * Security limiter wrapper with explicit backend outage behavior.
 */

import { config } from "./config.js";
import {
  consumeSecurityLimiterFixedWindow,
  resetSecurityLimiterMemoryState,
} from "./securityLimiter.js";
import { recordApiLimiterDecision } from "./runtimeMetrics.js";

const WINDOW_MS = 60_000;

export type RateLimitDecisionReason =
  | "allowed"
  | "limited"
  | "backend_fail_open"
  | "backend_fail_closed";

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  reason: RateLimitDecisionReason;
};

type ConsumeRateLimitDeps = {
  consumeFixedWindow?: typeof consumeSecurityLimiterFixedWindow;
  failureMode?: "fail-open" | "fail-closed";
};

const normalizeLimiterKey = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 512) || "unknown";

/**
 * Consume one rate-limit token from a fixed 1-minute window bucket.
 *
 * @param {string} key
 * @param {number} limit
 * @param {number} [now=Date.now()]
 * @returns {Promise<{allowed: boolean, retryAfterMs: number, remaining: number, reason: string}>}
 */
export const consumeRateLimit = (
  key: string,
  limit: number,
  now = Date.now(),
  {
    consumeFixedWindow = consumeSecurityLimiterFixedWindow,
    failureMode = config.securityLimiterFailureMode,
  }: ConsumeRateLimitDeps = {},
): Promise<RateLimitDecision> => {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const normalizedKey = normalizeLimiterKey(key);

  return consumeFixedWindow({
    scope: "api-rate-limit",
    keyMaterial: normalizedKey,
    limit: safeLimit,
    windowMs: WINDOW_MS,
    nowMs: now,
  })
    .then((result) => {
      if (result.allowed) {
        recordApiLimiterDecision({ outcome: "allowed" });
        return {
          allowed: true,
          retryAfterMs: 0,
          remaining: result.remaining,
          reason: "allowed" as const,
        };
      }

      recordApiLimiterDecision({ outcome: "rejected" });
      return {
        allowed: false,
        retryAfterMs: result.retryAfterMs,
        remaining: 0,
        reason: "limited" as const,
      };
    })
    .catch((error: unknown) => {
      const errorMessage =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: string }).message || "unknown error")
          : "unknown error";
      console.warn(`Security limiter warning: backend consume failed (${errorMessage}).`);
      recordApiLimiterDecision({ outcome: "backend_error" });

      if (failureMode === "fail-open") {
        recordApiLimiterDecision({ outcome: "fail_open" });
        return {
          allowed: true,
          retryAfterMs: 0,
          remaining: safeLimit,
          reason: "backend_fail_open" as const,
        };
      }

      recordApiLimiterDecision({ outcome: "fail_closed" });
      return {
        allowed: false,
        retryAfterMs: 1000,
        remaining: 0,
        reason: "backend_fail_closed" as const,
      };
    });
};

/**
 * Test helper to clear local memory limiter state.
 */
export const resetRateLimitState = (): void => {
  resetSecurityLimiterMemoryState();
};
