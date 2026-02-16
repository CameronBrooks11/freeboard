/**
 * @module rateLimit
 * @description Small in-memory fixed-window rate limiter for non-distributed controls.
 */

const WINDOW_MS = 60_000;
const buckets = new Map();

const trimWindow = (bucket, now) => {
  bucket.hits = bucket.hits.filter((ts) => now - ts < WINDOW_MS);
};

const ensureBucket = (key) => {
  if (!buckets.has(key)) {
    buckets.set(key, {
      hits: [],
    });
  }
  return buckets.get(key);
};

/**
 * Consume one rate-limit token from a fixed 1-minute window bucket.
 *
 * @param {string} key
 * @param {number} limit
 * @param {number} [now=Date.now()]
 * @returns {{allowed: boolean, retryAfterMs: number, remaining: number}}
 */
export const consumeRateLimit = (key, limit, now = Date.now()) => {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const bucket = ensureBucket(key);
  trimWindow(bucket, now);

  if (bucket.hits.length >= safeLimit) {
    const oldest = bucket.hits[0] || now;
    const retryAfterMs = Math.max(1, WINDOW_MS - (now - oldest));
    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, safeLimit - bucket.hits.length),
  };
};

/**
 * Test helper to clear all limiter state.
 */
export const resetRateLimitState = () => {
  buckets.clear();
};
