import type { SecurityLimiterRepository } from "../../contracts.js";
import { getPostgresPool } from "../../../db/postgres/client.js";

const toCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

export const createPostgresSecurityLimiterRepository = (): SecurityLimiterRepository => ({
  incrementCounter: async ({ documentId, expiresAt }) => {
    const pool = await getPostgresPool();
    const result = await pool.query<{ count: unknown }>(
      `
      INSERT INTO security_limiter_state (id, kind, count, lock_until, expires_at, created_at, updated_at)
      VALUES ($1, 'counter', 1, NULL, $2, NOW(), NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        kind = 'counter',
        count = security_limiter_state.count + 1,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      RETURNING count
      `,
      [documentId, expiresAt],
    );

    return toCount(result.rows[0]?.count);
  },

  getLockUntil: async ({ documentId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query<{ lock_until: unknown }>(
      `
      SELECT lock_until
      FROM security_limiter_state
      WHERE id = $1
        AND kind = 'lock'
      LIMIT 1
      `,
      [documentId],
    );

    const rawValue = result.rows[0]?.lock_until;
    if (!rawValue) {
      return null;
    }
    const lockUntil = new Date(rawValue as string | number | Date);
    return Number.isFinite(lockUntil.getTime()) ? lockUntil : null;
  },

  upsertLock: async ({ documentId, lockUntil, expiresAt }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      INSERT INTO security_limiter_state (id, kind, count, lock_until, expires_at, created_at, updated_at)
      VALUES ($1, 'lock', 0, $2, $3, NOW(), NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        kind = 'lock',
        lock_until = EXCLUDED.lock_until,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      `,
      [documentId, lockUntil, expiresAt],
    );
  },

  deleteCounterByPrefix: async ({ counterPrefix }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      DELETE FROM security_limiter_state
      WHERE id LIKE $1
      `,
      [`${counterPrefix}%`],
    );
  },

  deleteById: async ({ documentId }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      DELETE FROM security_limiter_state
      WHERE id = $1
      `,
      [documentId],
    );
  },
});
