import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getPostgresPool } from "../../../db/postgres/client.js";
import {
  DashboardRevisionConflictError,
  type DashboardAclEntryRecord,
  type DashboardDatasourceRecord,
  type DashboardRecord,
  type DashboardRepository,
} from "../../contracts.js";

type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};

const generateShareToken = () => crypto.randomBytes(24).toString("base64url");

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

const toDatasourceArray = (value: unknown): DashboardDatasourceRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      return entry as DashboardDatasourceRecord;
    })
    .filter((entry): entry is DashboardDatasourceRecord => Boolean(entry));
};

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toAclEntries = (value: unknown): DashboardAclEntryRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): DashboardAclEntryRecord | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as {
        userId?: unknown;
        accessLevel?: unknown;
        grantedBy?: unknown;
        grantedAt?: unknown;
      };
      const userId = String(record.userId || "").trim();
      if (!userId) {
        return null;
      }
      return {
        userId,
        accessLevel: String(record.accessLevel || "viewer"),
        grantedBy: record.grantedBy ? String(record.grantedBy) : null,
        grantedAt: toDate(record.grantedAt),
      };
    })
    .filter((entry): entry is DashboardAclEntryRecord => Boolean(entry));
};

const normalizeAclEntries = (value: DashboardAclEntryRecord[] = []): DashboardAclEntryRecord[] => {
  const byUserId = new Map<string, DashboardAclEntryRecord>();
  value.forEach((entry) => {
    const userId = String(entry?.userId || "").trim();
    if (!userId) {
      return;
    }
    byUserId.set(userId, {
      userId,
      accessLevel: String(entry.accessLevel || "viewer"),
      grantedBy: entry.grantedBy ? String(entry.grantedBy) : null,
      grantedAt: toDate(entry.grantedAt),
    });
  });
  return [...byUserId.values()];
};

const toRecord = (row: {
  id?: unknown;
  user_id?: unknown;
  visibility?: unknown;
  share_token?: unknown;
  share_token_version?: unknown;
  acl?: unknown;
  document?: unknown;
  document_revision?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): DashboardRecord => ({
  _id: String(row.id || ""),
  user: String(row.user_id || ""),
  visibility: String(row.visibility || "private"),
  shareToken: String(row.share_token || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(row.share_token_version) || 0)),
  acl: toAclEntries(row.acl),
  document: toObjectRecord(row.document),
  documentRevision: Math.max(1, Math.floor(Number(row.document_revision) || 1)),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const DASHBOARD_SELECT_FIELDS = `
  d.id,
  d.user_id,
  d.visibility,
  d.share_token,
  d.share_token_version,
  d.document,
  d.document_revision,
  d.created_at,
  d.updated_at,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'userId', da.user_id,
          'accessLevel', da.access_level,
          'grantedBy', da.granted_by,
          'grantedAt', da.granted_at
        )
        ORDER BY da.granted_at ASC
      )
      FROM dashboard_acl da
      WHERE da.dashboard_id = d.id
    ),
    '[]'::jsonb
  ) AS acl
`;

const queryDashboardById = async (
  queryable: Queryable,
  dashboardId: string,
): Promise<DashboardRecord | null> => {
  const result = await queryable.query(
    `
    SELECT ${DASHBOARD_SELECT_FIELDS}
    FROM dashboards d
    WHERE d.id = $1
    LIMIT 1
    `,
    [dashboardId],
  );

  return result.rows[0] ? toRecord(result.rows[0]) : null;
};

const insertAclEntries = async (
  queryable: Queryable,
  dashboardId: string,
  entries: DashboardAclEntryRecord[] = [],
): Promise<void> => {
  const normalizedEntries = normalizeAclEntries(entries);
  for (const entry of normalizedEntries) {
    await queryable.query(
      `
      INSERT INTO dashboard_acl (
        dashboard_id,
        user_id,
        access_level,
        granted_by,
        granted_at
      )
      VALUES ($1, $2, $3, $4, $5)
      `,
      [dashboardId, entry.userId, entry.accessLevel, entry.grantedBy, entry.grantedAt],
    );
  }
};

export const createPostgresDashboardRepository = (): DashboardRepository => ({
  findById: async ({ dashboardId }) => {
    const pool = await getPostgresPool();
    return queryDashboardById(pool, dashboardId);
  },

  findByShareToken: async ({ shareToken }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${DASHBOARD_SELECT_FIELDS}
      FROM dashboards d
      WHERE d.share_token = $1
      LIMIT 1
      `,
      [shareToken],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  listAll: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${DASHBOARD_SELECT_FIELDS}
      FROM dashboards d
      `,
    );

    return result.rows.map((row) => toRecord(row));
  },

  listAccessible: async ({ viewerUserId, includePublic }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${DASHBOARD_SELECT_FIELDS}
      FROM dashboards d
      WHERE d.user_id = $1
         OR EXISTS (
          SELECT 1
          FROM dashboard_acl da
          WHERE da.dashboard_id = d.id
            AND da.user_id = $1
        )
         OR ($2::boolean = TRUE AND d.visibility = 'public')
      `,
      [viewerUserId, includePublic === true],
    );

    return result.rows.map((row) => toRecord(row));
  },

  listForDiagnostics: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        visibility,
        document->'datasources' AS datasources
      FROM dashboards
      `,
    );

    return result.rows.map((row) => ({
      _id: String(row.id || ""),
      visibility: String(row.visibility || "private"),
      datasources: toDatasourceArray(row.datasources),
    }));
  },

  findImpactedByUserId: async ({ userId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${DASHBOARD_SELECT_FIELDS}
      FROM dashboards d
      WHERE d.user_id = $1
         OR EXISTS (
          SELECT 1
          FROM dashboard_acl da
          WHERE da.dashboard_id = d.id
            AND da.user_id = $1
        )
      `,
      [userId],
    );

    return result.rows.map((row) => toRecord(row));
  },

  create: async ({ visibility, user, shareToken, shareTokenVersion, acl, document }) => {
    const pool = await getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const dashboardId = nanoid();
      const insertedShareToken = String(shareToken || "").trim() || generateShareToken();
      const normalizedUser = String(user || "").trim();
      const normalizedVisibility = String(visibility || "private");

      await client.query(
        `
        INSERT INTO dashboards (
          id,
          user_id,
          visibility,
          share_token,
          share_token_version,
          document,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          NOW(),
          NOW()
        )
        `,
        [
          dashboardId,
          normalizedUser,
          normalizedVisibility,
          insertedShareToken,
          Math.max(0, Math.floor(Number(shareTokenVersion) || 0)),
          JSON.stringify(toObjectRecord(document)),
        ],
      );

      await insertAclEntries(client, dashboardId, acl || []);

      const created = await queryDashboardById(client, dashboardId);
      await client.query("COMMIT");

      if (!created) {
        throw new Error("Failed to fetch created dashboard");
      }

      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  updateById: async ({ dashboardId, patch, expectedDocumentRevision }) => {
    const pool = await getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const sets: string[] = [];
      const values: unknown[] = [];
      const add = (column: string, value: unknown, suffix = "") => {
        values.push(value);
        sets.push(`${column} = $${values.length}${suffix}`);
      };

      if (Object.prototype.hasOwnProperty.call(patch, "user")) {
        add("user_id", String(patch.user || "").trim());
      }
      if (Object.prototype.hasOwnProperty.call(patch, "visibility")) {
        add("visibility", String(patch.visibility || ""));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "shareToken")) {
        add("share_token", String(patch.shareToken || ""));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "shareTokenVersion")) {
        add("share_token_version", Math.max(0, Math.floor(Number(patch.shareTokenVersion) || 0)));
      }
      const updatesDocument = Object.prototype.hasOwnProperty.call(patch, "document");
      if (updatesDocument) {
        add("document", JSON.stringify(toObjectRecord(patch.document)), "::jsonb");
        // The revision advances only when the document itself changes.
        sets.push("document_revision = document_revision + 1");
      }

      if (sets.length) {
        values.push(dashboardId);
        let whereClause = `WHERE id = $${values.length}`;
        // Optimistic-concurrency guard: a document write only applies if the
        // stored revision still matches the one the writer loaded.
        const guardRevision =
          updatesDocument && typeof expectedDocumentRevision === "number"
            ? Math.max(1, Math.floor(expectedDocumentRevision))
            : null;
        if (guardRevision !== null) {
          values.push(guardRevision);
          whereClause += ` AND document_revision = $${values.length}`;
        }

        const updated = await client.query(
          `
          UPDATE dashboards
          SET
            ${sets.join(",\n            ")},
            updated_at = NOW()
          ${whereClause}
          RETURNING id
          `,
          values,
        );

        if (!updated.rows[0]) {
          // Distinguish a stale-revision conflict from a missing dashboard so
          // the caller can report the right error.
          const existing = await client.query<{ document_revision?: unknown }>(
            `SELECT document_revision FROM dashboards WHERE id = $1 LIMIT 1`,
            [dashboardId],
          );
          if (guardRevision !== null && existing.rows[0]) {
            // Let the catch block roll back the open transaction.
            throw new DashboardRevisionConflictError(
              Math.max(1, Math.floor(Number(existing.rows[0].document_revision) || 1)),
            );
          }
          await client.query("ROLLBACK");
          return null;
        }
      } else {
        const existing = await client.query(
          `
          SELECT id
          FROM dashboards
          WHERE id = $1
          LIMIT 1
          `,
          [dashboardId],
        );

        if (!existing.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
      }

      if (Object.prototype.hasOwnProperty.call(patch, "acl")) {
        await client.query(
          `
          DELETE FROM dashboard_acl
          WHERE dashboard_id = $1
          `,
          [dashboardId],
        );

        await insertAclEntries(client, dashboardId, patch.acl || []);
      }

      const updatedRecord = await queryDashboardById(client, dashboardId);
      await client.query("COMMIT");
      return updatedRecord;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  upsertAclEntry: async ({ dashboardId, entry }) => {
    const normalized = normalizeAclEntries([entry])[0];
    if (!normalized) {
      return null;
    }
    const pool = await getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT id FROM dashboards WHERE id = $1 LIMIT 1", [
        dashboardId,
      ]);
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(
        `
        INSERT INTO dashboard_acl (dashboard_id, user_id, access_level, granted_by, granted_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (dashboard_id, user_id)
        DO UPDATE SET
          access_level = EXCLUDED.access_level,
          granted_by = EXCLUDED.granted_by,
          granted_at = EXCLUDED.granted_at
        `,
        [
          dashboardId,
          normalized.userId,
          normalized.accessLevel,
          normalized.grantedBy,
          normalized.grantedAt,
        ],
      );
      const updated = await queryDashboardById(client, dashboardId);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  deleteAclEntry: async ({ dashboardId, userId }) => {
    const normalizedUserId = String(userId || "").trim();
    const pool = await getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT id FROM dashboards WHERE id = $1 LIMIT 1", [
        dashboardId,
      ]);
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query("DELETE FROM dashboard_acl WHERE dashboard_id = $1 AND user_id = $2", [
        dashboardId,
        normalizedUserId,
      ]);
      const updated = await queryDashboardById(client, dashboardId);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  deleteById: async ({ dashboardId }) => {
    const pool = await getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const existing = await queryDashboardById(client, dashboardId);
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
        DELETE FROM dashboards
        WHERE id = $1
        `,
        [dashboardId],
      );

      await client.query("COMMIT");
      return existing;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
});
