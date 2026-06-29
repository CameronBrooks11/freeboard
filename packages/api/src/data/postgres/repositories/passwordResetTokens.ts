import { nanoid } from "nanoid";
import { getPostgresPool } from "../../../db/postgres/client.js";
import type { PasswordResetTokenRecord, PasswordResetTokenRepository } from "../../contracts.js";
import { toDate } from "../../../util.js";

const toRecord = (row: {
  id?: unknown;
  user_id?: unknown;
  token_hash?: unknown;
  created_by?: unknown;
  requested_by_email?: unknown;
  revoked_at?: unknown;
  used_at?: unknown;
  expires_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): PasswordResetTokenRecord => ({
  _id: String(row.id || ""),
  userId: String(row.user_id || ""),
  tokenHash: String(row.token_hash || ""),
  createdBy: row.created_by ? String(row.created_by) : null,
  requestedByEmail: row.requested_by_email ? String(row.requested_by_email) : null,
  revokedAt: row.revoked_at ? toDate(row.revoked_at) : null,
  usedAt: row.used_at ? toDate(row.used_at) : null,
  expiresAt: toDate(row.expires_at),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const SELECT_FIELDS = `
  id,
  user_id,
  token_hash,
  created_by,
  requested_by_email,
  revoked_at,
  used_at,
  expires_at,
  created_at,
  updated_at
`;

export const createPostgresPasswordResetTokenRepository = (): PasswordResetTokenRepository => ({
  findActiveByTokenHash: async ({ tokenHash, now }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${SELECT_FIELDS}
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND used_at IS NULL
        AND expires_at > $2
      LIMIT 1
      `,
      [tokenHash, now],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  revokeActiveByUserId: async ({ userId, now }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE password_reset_tokens
      SET
        revoked_at = $2,
        updated_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND used_at IS NULL
        AND expires_at > $2
      `,
      [userId, now],
    );
  },

  create: async ({ userId, tokenHash, createdBy, requestedByEmail, expiresAt }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      INSERT INTO password_reset_tokens (
        id,
        user_id,
        token_hash,
        created_by,
        requested_by_email,
        expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING ${SELECT_FIELDS}
      `,
      [nanoid(), userId, tokenHash, createdBy, requestedByEmail, expiresAt],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error("Failed to create password reset token");
    }
    return toRecord(createdRow);
  },

  markUsedById: async ({ tokenId, usedAt }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE password_reset_tokens
      SET
        used_at = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [tokenId, usedAt],
    );
  },
});
