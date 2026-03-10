import { getPostgresPool } from "../../../db/postgres/client.js";
import { nanoid } from "nanoid";
import type { ServiceAccountTokenRecord, ServiceAccountTokenRepository } from "../../contracts.js";

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

const toScopes = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const toRecord = (row: {
  id?: unknown;
  service_account_id?: unknown;
  label?: unknown;
  scopes?: unknown;
  token_hash?: unknown;
  token_prefix?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
  created_by_user_id?: unknown;
  last_used_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): ServiceAccountTokenRecord => ({
  _id: String(row.id || ""),
  serviceAccountId: String(row.service_account_id || ""),
  label: row.label ? String(row.label) : null,
  scopes: toScopes(row.scopes),
  tokenHash: String(row.token_hash || ""),
  tokenPrefix: String(row.token_prefix || ""),
  expiresAt: row.expires_at ? toDate(row.expires_at) : null,
  revokedAt: row.revoked_at ? toDate(row.revoked_at) : null,
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  lastUsedAt: row.last_used_at ? toDate(row.last_used_at) : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

export const createPostgresServiceAccountTokenRepository = (): ServiceAccountTokenRepository => ({
  listActive: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        service_account_id,
        label,
        scopes,
        token_hash,
        token_prefix,
        expires_at,
        revoked_at,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      FROM service_account_tokens
      WHERE revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
    );

    return result.rows.map((row) => toRecord(row));
  },

  listByServiceAccountIdSortedByCreatedAtDesc: async ({ serviceAccountId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        service_account_id,
        label,
        scopes,
        token_hash,
        token_prefix,
        expires_at,
        revoked_at,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      FROM service_account_tokens
      WHERE service_account_id = $1
      ORDER BY created_at DESC
      `,
      [serviceAccountId],
    );

    return result.rows.map((row) => toRecord(row));
  },

  findById: async ({ tokenId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        service_account_id,
        label,
        scopes,
        token_hash,
        token_prefix,
        expires_at,
        revoked_at,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      FROM service_account_tokens
      WHERE id = $1
      LIMIT 1
      `,
      [tokenId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  create: async ({
    serviceAccountId,
    label,
    scopes,
    tokenHash,
    tokenPrefix,
    expiresAt,
    createdByUserId,
  }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      INSERT INTO service_account_tokens (
        id,
        service_account_id,
        label,
        scopes,
        token_hash,
        token_prefix,
        expires_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING
        id,
        service_account_id,
        label,
        scopes,
        token_hash,
        token_prefix,
        expires_at,
        revoked_at,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      `,
      [
        nanoid(),
        serviceAccountId,
        label,
        scopes,
        tokenHash,
        tokenPrefix,
        expiresAt,
        createdByUserId,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error("Failed to create service account token");
    }
    return toRecord(createdRow);
  },

  touchLastUsed: async ({ tokenId, lastUsedAt }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE service_account_tokens
      SET
        last_used_at = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [tokenId, lastUsedAt],
    );
  },

  countActiveByServiceAccountId: async ({ serviceAccountId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query<{ count: unknown }>(
      `
      SELECT COUNT(*) AS count
      FROM service_account_tokens
      WHERE service_account_id = $1
        AND revoked_at IS NULL
      `,
      [serviceAccountId],
    );

    const parsed = Number(result.rows[0]?.count);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.floor(parsed));
  },

  revokeById: async ({ tokenId, revokedAt }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      UPDATE service_account_tokens
      SET
        revoked_at = $2,
        updated_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING
        id,
        service_account_id,
        label,
        scopes,
        token_hash,
        token_prefix,
        expires_at,
        revoked_at,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      `,
      [tokenId, revokedAt],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  revokeActiveByServiceAccountId: async ({ serviceAccountId, revokedAt }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE service_account_tokens
      SET
        revoked_at = $2,
        updated_at = NOW()
      WHERE service_account_id = $1
        AND revoked_at IS NULL
      `,
      [serviceAccountId, revokedAt],
    );
  },
});
