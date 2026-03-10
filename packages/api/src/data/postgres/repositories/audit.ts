import { config } from "../../../config.js";
import { getPostgresPool } from "../../../db/postgres/client.js";
import type { AuditEventRecord, AuditRepository } from "../../contracts.js";

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
  actor_user_id?: unknown;
  action?: unknown;
  target_type?: unknown;
  target_id?: unknown;
  metadata?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): AuditEventRecord => ({
  _id: String(row.id || ""),
  actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
  action: String(row.action || ""),
  targetType: row.target_type ? String(row.target_type) : null,
  targetId: row.target_id ? String(row.target_id) : null,
  metadata:
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {},
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const escapeLikePrefix = (value: string): string => value.replace(/[\\%_]/g, "\\$&");

export const createPostgresAuditRepository = (): AuditRepository => ({
  isReady: () => Boolean(config.postgresUrl),

  insertEvent: async ({
    actorUserId = null,
    action,
    targetType = null,
    targetId = null,
    metadata = {},
  }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      INSERT INTO audit_events (
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `,
      [actorUserId, action, targetType, targetId, metadata],
    );
  },

  queryEvents: async ({ actionPrefix = "", limit }) => {
    const pool = await getPostgresPool();
    const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 1));
    const normalizedPrefix = String(actionPrefix || "").trim();

    if (!normalizedPrefix) {
      const result = await pool.query(
        `
        SELECT id, actor_user_id, action, target_type, target_id, metadata, created_at, updated_at
        FROM audit_events
        ORDER BY created_at DESC, id DESC
        LIMIT $1
        `,
        [normalizedLimit],
      );
      return result.rows.map((row) => toRecord(row));
    }

    const escapedPrefix = `${escapeLikePrefix(normalizedPrefix)}%`;
    const result = await pool.query(
      `
      SELECT id, actor_user_id, action, target_type, target_id, metadata, created_at, updated_at
      FROM audit_events
      WHERE action LIKE $1 ESCAPE '\\'
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [escapedPrefix, normalizedLimit],
    );

    return result.rows.map((row) => toRecord(row));
  },
});
