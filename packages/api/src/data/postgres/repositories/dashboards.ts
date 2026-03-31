import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getPostgresPool } from "../../../db/postgres/client.js";
import type {
  DashboardAclEntryRecord,
  DashboardDatasourceRecord,
  DashboardRecord,
  DashboardRepository,
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

const toUnknownArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value;
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
  version?: unknown;
  title?: unknown;
  visibility?: unknown;
  share_token?: unknown;
  share_token_version?: unknown;
  acl?: unknown;
  image?: unknown;
  datasources?: unknown;
  columns?: unknown;
  width?: unknown;
  panes?: unknown;
  settings?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): DashboardRecord => ({
  _id: String(row.id || ""),
  user: String(row.user_id || ""),
  version: String(row.version || "1"),
  title: String(row.title || ""),
  visibility: String(row.visibility || "private"),
  shareToken: String(row.share_token || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(row.share_token_version) || 0)),
  acl: toAclEntries(row.acl),
  image: row.image ? String(row.image) : null,
  datasources: toDatasourceArray(row.datasources),
  columns: Number.isFinite(Number(row.columns)) ? Math.floor(Number(row.columns)) : null,
  width: row.width ? String(row.width) : null,
  panes: toUnknownArray(row.panes),
  settings: toObjectRecord(row.settings),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const DASHBOARD_SELECT_FIELDS = `
  d.id,
  d.user_id,
  d.version,
  d.title,
  d.visibility,
  d.share_token,
  d.share_token_version,
  d.image,
  d.datasources,
  d.columns,
  d.width,
  d.panes,
  d.settings,
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
        datasources
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

  create: async ({
    title,
    version,
    visibility,
    user,
    shareToken,
    shareTokenVersion,
    acl,
    image,
    datasources,
    columns,
    width,
    panes,
    settings,
  }) => {
    const pool = await getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const dashboardId = nanoid();
      const insertedShareToken = String(shareToken || "").trim() || generateShareToken();
      const normalizedUser = String(user || "").trim();
      const normalizedVersion = String(version || "1");
      const normalizedTitle = String(title || "");
      const normalizedVisibility = String(visibility || "private");

      await client.query(
        `
        INSERT INTO dashboards (
          id,
          user_id,
          version,
          title,
          visibility,
          share_token,
          share_token_version,
          image,
          datasources,
          columns,
          width,
          panes,
          settings,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::jsonb,
          $10,
          $11,
          $12::jsonb,
          $13::jsonb,
          NOW(),
          NOW()
        )
        `,
        [
          dashboardId,
          normalizedUser,
          normalizedVersion,
          normalizedTitle,
          normalizedVisibility,
          insertedShareToken,
          Math.max(0, Math.floor(Number(shareTokenVersion) || 0)),
          image == null ? null : String(image),
          JSON.stringify(Array.isArray(datasources) ? datasources : []),
          columns === undefined ? null : columns,
          width === undefined ? "md" : width,
          JSON.stringify(Array.isArray(panes) ? panes : []),
          JSON.stringify(
            settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {},
          ),
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

  updateById: async ({ dashboardId, patch }) => {
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
      if (Object.prototype.hasOwnProperty.call(patch, "version")) {
        add("version", String(patch.version || ""));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "title")) {
        add("title", String(patch.title || ""));
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
      if (Object.prototype.hasOwnProperty.call(patch, "image")) {
        add("image", patch.image == null ? null : String(patch.image));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "datasources")) {
        add(
          "datasources",
          JSON.stringify(Array.isArray(patch.datasources) ? patch.datasources : []),
          "::jsonb",
        );
      }
      if (Object.prototype.hasOwnProperty.call(patch, "columns")) {
        add("columns", patch.columns === undefined ? null : patch.columns);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "width")) {
        add("width", patch.width == null ? null : String(patch.width || ""));
      }
      if (Object.prototype.hasOwnProperty.call(patch, "panes")) {
        add("panes", JSON.stringify(Array.isArray(patch.panes) ? patch.panes : []), "::jsonb");
      }
      if (Object.prototype.hasOwnProperty.call(patch, "settings")) {
        add(
          "settings",
          JSON.stringify(
            patch.settings && typeof patch.settings === "object" && !Array.isArray(patch.settings)
              ? patch.settings
              : {},
          ),
          "::jsonb",
        );
      }

      if (sets.length) {
        values.push(dashboardId);
        const updated = await client.query(
          `
          UPDATE dashboards
          SET
            ${sets.join(",\n            ")},
            updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING id
          `,
          values,
        );

        if (!updated.rows[0]) {
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
