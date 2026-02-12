/**
 * @module loginThrottle
 * @description In-memory login attempt throttle with rolling-window lockout.
 */

import { config } from "./config.js";

const attemptState = new Map();

const toMs = (seconds) => Number(seconds) * 1000;
const WINDOW_MS = toMs(config.authLoginWindowSeconds);
const LOCK_MS = toMs(config.authLoginLockSeconds);
const MAX_ATTEMPTS = Number(config.authLoginMaxAttempts);

const trimFailures = (entry, now) => {
  entry.failedAt = entry.failedAt.filter((ts) => now - ts <= WINDOW_MS);
};

const ensureEntry = (key) => {
  if (!attemptState.has(key)) {
    attemptState.set(key, {
      failedAt: [],
      lockUntil: 0,
    });
  }
  return attemptState.get(key);
};

const destroyIfIdle = (key, entry) => {
  if (entry.failedAt.length === 0 && entry.lockUntil <= 0) {
    attemptState.delete(key);
  }
};

const normalizeKeyPart = (value, fallback) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
};

/**
 * Build stable throttle key from login email and client ip.
 *
 * @param {string} email
 * @param {string|undefined|null} clientIp
 * @returns {string}
 */
export const buildLoginThrottleKey = (email, clientIp) => {
  const normalizedEmail = normalizeKeyPart(email, "unknown-email");
  const normalizedIp = normalizeKeyPart(clientIp, "unknown-ip");
  return `${normalizedEmail}::${normalizedIp}`;
};

/**
 * Read current throttle state.
 *
 * @param {string} key
 * @param {number} [now=Date.now()]
 * @returns {{ blocked: boolean, retryAfterMs: number }}
 */
export const getLoginThrottleState = (key, now = Date.now()) => {
  const entry = attemptState.get(key);
  if (!entry) {
    return { blocked: false, retryAfterMs: 0 };
  }

  trimFailures(entry, now);
  if (entry.lockUntil > now) {
    return {
      blocked: true,
      retryAfterMs: entry.lockUntil - now,
    };
  }

  entry.lockUntil = 0;
  destroyIfIdle(key, entry);
  return { blocked: false, retryAfterMs: 0 };
};

/**
 * Record failed login attempt and compute resulting lockout state.
 *
 * @param {string} key
 * @param {number} [now=Date.now()]
 * @returns {{ blocked: boolean, retryAfterMs: number, justLocked: boolean }}
 */
export const recordFailedLoginAttempt = (key, now = Date.now()) => {
  const entry = ensureEntry(key);
  trimFailures(entry, now);

  if (entry.lockUntil > now) {
    return {
      blocked: true,
      retryAfterMs: entry.lockUntil - now,
      justLocked: false,
    };
  }

  entry.failedAt.push(now);
  if (entry.failedAt.length < MAX_ATTEMPTS) {
    return {
      blocked: false,
      retryAfterMs: 0,
      justLocked: false,
    };
  }

  entry.failedAt = [];
  entry.lockUntil = now + LOCK_MS;
  return {
    blocked: true,
    retryAfterMs: LOCK_MS,
    justLocked: true,
  };
};

/**
 * Clear throttle state after successful authentication.
 *
 * @param {string} key
 */
export const clearLoginThrottle = (key) => {
  attemptState.delete(key);
};

/**
 * Test helper to reset all in-memory throttle state.
 */
export const resetLoginThrottleState = () => {
  attemptState.clear();
};

