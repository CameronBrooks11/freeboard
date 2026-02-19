/**
 * @module rateLimit
 * @description Small in-memory fixed-window rate limiter for non-distributed controls.
 */

const WINDOW_MS = 60_000;
type RateLimitBucket = {
  hits: number[];
};
const buckets = new Map<string, RateLimitBucket>();

const trimWindow = (bucket: RateLimitBucket, now: number): void => {
  bucket.hits = bucket.hits.filter((ts) => now - ts < WINDOW_MS);
};

const ensureBucket = (key: string): RateLimitBucket => {
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: RateLimitBucket = {
    hits: [],
  };
  buckets.set(key, created);
  return created;
};

/**
 * Consume one rate-limit token from a fixed 1-minute window bucket.
 *
 * @param {string} key
 * @param {number} limit
 * @param {number} [now=Date.now()]
 * @returns {{allowed: boolean, retryAfterMs: number, remaining: number}}
 */
export const consumeRateLimit = (
  key: string,
  limit: number,
  now = Date.now(),
): { allowed: boolean; retryAfterMs: number; remaining: number } => {
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
export const resetRateLimitState = (): void => {
  buckets.clear();
};
