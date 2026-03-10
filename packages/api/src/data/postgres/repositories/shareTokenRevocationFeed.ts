import { config } from "../../../config.js";
import { getPostgresPool } from "../../../db/postgres/client.js";
import type {
  ShareTokenRevocationEventRecord,
  ShareTokenRevocationRepository,
} from "../../contracts.js";

const toValidDate = (value: unknown, fallback = new Date()): Date => {
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
  dashboard_id?: unknown;
  share_token_version?: unknown;
  revoked_at?: unknown;
  created_at?: unknown;
}): ShareTokenRevocationEventRecord => ({
  eventId: String(row.id || ""),
  dashboardId: String(row.dashboard_id || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(row.share_token_version) || 0)),
  revokedAt: toValidDate(row.revoked_at),
  createdAt: toValidDate(row.created_at, toValidDate(row.revoked_at)),
});

const toSafeCursorEventId = (eventId: string): bigint | null => {
  if (!/^\d+$/.test(String(eventId || "").trim())) {
    return null;
  }
  try {
    return BigInt(eventId);
  } catch {
    return null;
  }
};

export const createPostgresShareTokenRevocationRepository = (): ShareTokenRevocationRepository => ({
  isReady: () => Boolean(config.postgresUrl),

  insertEvent: async ({ dashboardId, shareTokenVersion, revokedAt }) => {
    const pool = await getPostgresPool();
    const createdAt = new Date();
    await pool.query(
      `
      INSERT INTO share_token_revocation_events (
        dashboard_id,
        share_token_version,
        revoked_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $4)
      `,
      [dashboardId, shareTokenVersion, revokedAt, createdAt],
    );
  },

  queryEvents: async ({ retentionCutoff, cursor, limit }) => {
    const pool = await getPostgresPool();

    if (!cursor) {
      const result = await pool.query(
        `
        SELECT id, dashboard_id, share_token_version, revoked_at, created_at
        FROM share_token_revocation_events
        WHERE revoked_at >= $1
        ORDER BY created_at ASC, id ASC
        LIMIT $2
        `,
        [retentionCutoff, limit],
      );
      return result.rows.map((row) => toRecord(row));
    }

    const cursorEventId = toSafeCursorEventId(cursor.eventId);
    if (cursorEventId === null) {
      const result = await pool.query(
        `
        SELECT id, dashboard_id, share_token_version, revoked_at, created_at
        FROM share_token_revocation_events
        WHERE revoked_at >= $1
          AND created_at > $2
        ORDER BY created_at ASC, id ASC
        LIMIT $3
        `,
        [retentionCutoff, cursor.createdAt, limit],
      );
      return result.rows.map((row) => toRecord(row));
    }

    const result = await pool.query(
      `
      SELECT id, dashboard_id, share_token_version, revoked_at, created_at
      FROM share_token_revocation_events
      WHERE revoked_at >= $1
        AND (created_at > $2 OR (created_at = $2 AND id > $3))
      ORDER BY created_at ASC, id ASC
      LIMIT $4
      `,
      [retentionCutoff, cursor.createdAt, cursorEventId.toString(), limit],
    );
    return result.rows.map((row) => toRecord(row));
  },
});
