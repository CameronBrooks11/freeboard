import { nanoid } from "nanoid";
import { getPostgresPool } from "../../../db/postgres/client.js";
import type { InviteTokenRecord, InviteTokenRepository } from "../../contracts.js";

const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const normalized = new Date(value as Date | string | number);
  if (!Number.isFinite(normalized.getTime())) {
    return fallback;
  }
  return normalized;
};

const toRecord = (row: {
  id?: unknown;
  email?: unknown;
  role?: unknown;
  token_hash?: unknown;
  created_by?: unknown;
  revoked_at?: unknown;
  accepted_at?: unknown;
  accepted_user_id?: unknown;
  expires_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): InviteTokenRecord => ({
  _id: String(row.id || ""),
  email: String(row.email || ""),
  role: String(row.role || "viewer"),
  tokenHash: String(row.token_hash || ""),
  createdBy: row.created_by ? String(row.created_by) : null,
  revokedAt: row.revoked_at ? toDate(row.revoked_at) : null,
  acceptedAt: row.accepted_at ? toDate(row.accepted_at) : null,
  acceptedUserId: row.accepted_user_id ? String(row.accepted_user_id) : null,
  expiresAt: toDate(row.expires_at),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const SELECT_FIELDS = `
  id,
  email,
  role,
  token_hash,
  created_by,
  revoked_at,
  accepted_at,
  accepted_user_id,
  expires_at,
  created_at,
  updated_at
`;

export const createPostgresInviteTokenRepository = (): InviteTokenRepository => ({
  listPending: async ({ now }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${SELECT_FIELDS}
      FROM invite_tokens
      WHERE revoked_at IS NULL
        AND accepted_at IS NULL
        AND expires_at > $1
      ORDER BY created_at DESC
      `,
      [now],
    );

    return result.rows.map((row) => toRecord(row));
  },

  findActiveByTokenHash: async ({ tokenHash, now }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${SELECT_FIELDS}
      FROM invite_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND accepted_at IS NULL
        AND expires_at > $2
      LIMIT 1
      `,
      [tokenHash, now],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  revokePendingByEmail: async ({ email, now }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE invite_tokens
      SET
        revoked_at = $2,
        updated_at = NOW()
      WHERE email = $1
        AND revoked_at IS NULL
        AND accepted_at IS NULL
        AND expires_at > $2
      `,
      [email, now],
    );
  },

  create: async ({ email, role, tokenHash, createdBy, expiresAt }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      INSERT INTO invite_tokens (
        id,
        email,
        role,
        token_hash,
        created_by,
        expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING ${SELECT_FIELDS}
      `,
      [nanoid(), email, role, tokenHash, createdBy, expiresAt],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error("Failed to create invite token");
    }
    return toRecord(createdRow);
  },

  markAcceptedById: async ({ inviteId, acceptedAt, acceptedUserId }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE invite_tokens
      SET
        accepted_at = $2,
        accepted_user_id = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [inviteId, acceptedAt, acceptedUserId],
    );
  },

  revokePendingById: async ({ inviteId, now }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      UPDATE invite_tokens
      SET
        revoked_at = $2,
        updated_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
        AND accepted_at IS NULL
        AND expires_at > $2
      RETURNING ${SELECT_FIELDS}
      `,
      [inviteId, now],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },
});
