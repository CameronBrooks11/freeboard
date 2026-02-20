/**
 * @module loginThrottle
 * Login throttle built on shared security limiter primitives.
 */

import { config } from "./config.js";
import {
  buildLimiterCompositeKey,
  clearSecurityLimiterState,
  consumeSecurityLimiterFixedWindow,
  getSecurityLimiterLockState,
  hashLimiterKeyPart,
  resetSecurityLimiterMemoryState,
  setSecurityLimiterLock,
} from "./securityLimiter.js";
import { recordApiLimiterDecision } from "./runtimeMetrics.js";

const toMs = (seconds: number): number => Number(seconds) * 1000;
const WINDOW_MS = toMs(config.authLoginWindowSeconds);
const LOCK_MS = toMs(config.authLoginLockSeconds);
const MAX_ATTEMPTS = Number(config.authLoginMaxAttempts);
const THROTTLE_SCOPE = "auth-login-throttle";
const FALLBACK_RETRY_AFTER_MS = 1000;

/**
 * Build stable throttle key from login email and client ip.
 *
 * @param {string} email
 * @param {string|undefined|null} clientIp
 * @returns {string}
 */
export const buildLoginThrottleKey = (
  email: string,
  clientIp: string | undefined | null,
): string => {
  return buildLimiterCompositeKey(
    hashLimiterKeyPart(email),
    hashLimiterKeyPart(clientIp || "unknown-ip"),
  );
};

/**
 * Read current throttle state.
 *
 * @param {string} key
 * @param {number} [now=Date.now()]
 * @returns {Promise<{ blocked: boolean, retryAfterMs: number, unavailable?: boolean }>}
 */
export const getLoginThrottleState = (
  key: string,
  now = Date.now(),
): Promise<{ blocked: boolean; retryAfterMs: number; unavailable?: boolean }> => {
  return getSecurityLimiterLockState({
    scope: THROTTLE_SCOPE,
    keyMaterial: key,
    nowMs: now,
  }).catch((error: unknown) => {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: string }).message || "unknown error")
        : "unknown error";
    console.warn(`Security limiter warning: failed to read login lock state (${errorMessage}).`);
    recordApiLimiterDecision({ outcome: "backend_error" });

    if (config.securityLimiterFailureMode === "fail-open") {
      recordApiLimiterDecision({ outcome: "fail_open" });
      return {
        blocked: false,
        retryAfterMs: 0,
      };
    }

    recordApiLimiterDecision({ outcome: "fail_closed" });
    return {
      blocked: true,
      retryAfterMs: FALLBACK_RETRY_AFTER_MS,
      unavailable: true,
    };
  });
};

/**
 * Record failed login attempt and compute resulting lockout state.
 *
 * @param {string} key
 * @param {number} [now=Date.now()]
 * @returns {Promise<{ blocked: boolean, retryAfterMs: number, justLocked: boolean, unavailable?: boolean }>}
 */
export const recordFailedLoginAttempt = (
  key: string,
  now = Date.now(),
): Promise<{
  blocked: boolean;
  retryAfterMs: number;
  justLocked: boolean;
  unavailable?: boolean;
}> => {
  return getSecurityLimiterLockState({
    scope: THROTTLE_SCOPE,
    keyMaterial: key,
    nowMs: now,
  })
    .then(async (lockState) => {
      if (lockState.blocked) {
        return {
          blocked: true,
          retryAfterMs: lockState.retryAfterMs,
          justLocked: false,
        };
      }

      const consumeResult = await consumeSecurityLimiterFixedWindow({
        scope: THROTTLE_SCOPE,
        keyMaterial: key,
        limit: MAX_ATTEMPTS,
        windowMs: WINDOW_MS,
        nowMs: now,
      });
      const reachedThreshold = consumeResult.allowed && consumeResult.remaining === 0;
      if (consumeResult.allowed && !reachedThreshold) {
        recordApiLimiterDecision({ outcome: "allowed" });
        return {
          blocked: false,
          retryAfterMs: 0,
          justLocked: false,
        };
      }

      recordApiLimiterDecision({ outcome: "rejected" });
      await setSecurityLimiterLock({
        scope: THROTTLE_SCOPE,
        keyMaterial: key,
        ttlMs: LOCK_MS,
        nowMs: now,
      });
      return {
        blocked: true,
        retryAfterMs: LOCK_MS,
        justLocked: true,
      };
    })
    .catch((error: unknown) => {
      const errorMessage =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: string }).message || "unknown error")
          : "unknown error";
      console.warn(`Security limiter warning: failed to record login attempt (${errorMessage}).`);
      recordApiLimiterDecision({ outcome: "backend_error" });

      if (config.securityLimiterFailureMode === "fail-open") {
        recordApiLimiterDecision({ outcome: "fail_open" });
        return {
          blocked: false,
          retryAfterMs: 0,
          justLocked: false,
        };
      }

      recordApiLimiterDecision({ outcome: "fail_closed" });
      return {
        blocked: true,
        retryAfterMs: FALLBACK_RETRY_AFTER_MS,
        justLocked: false,
        unavailable: true,
      };
    });
};

/**
 * Clear throttle state after successful authentication.
 *
 * @param {string} key
 */
export const clearLoginThrottle = async (key: string): Promise<void> => {
  await clearSecurityLimiterState({
    scope: THROTTLE_SCOPE,
    keyMaterial: key,
  }).catch((error: unknown) => {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: string }).message || "unknown error")
        : "unknown error";
    console.warn(
      `Security limiter warning: failed to clear login throttle state (${errorMessage}).`,
    );
    recordApiLimiterDecision({ outcome: "backend_error" });
  });
};

/**
 * Test helper to reset local memory throttle state.
 */
export const resetLoginThrottleState = (): void => {
  resetSecurityLimiterMemoryState();
};
