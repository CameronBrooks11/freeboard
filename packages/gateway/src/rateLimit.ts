/**
 * @module gateway/rateLimit
 * @description Sliding one-minute in-memory rate-limit buckets.
 */

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export const consumeRateLimit = (
  key: string,
  limitPerMinute: number,
): { allowed: boolean; retryAfterMs: number } => {
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const windowMs = 60_000;
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= limitPerMinute) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
};
