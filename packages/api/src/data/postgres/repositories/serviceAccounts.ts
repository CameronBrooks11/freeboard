import { getPostgresPool } from "../../../db/postgres/client.js";
import { nanoid } from "nanoid";
import type { ServiceAccountRecord, ServiceAccountRepository } from "../../contracts.js";

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
  name?: unknown;
  description?: unknown;
  active?: unknown;
  scopes?: unknown;
  created_by_user_id?: unknown;
  last_used_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): ServiceAccountRecord => ({
  _id: String(row.id || ""),
  name: String(row.name || ""),
  description: String(row.description || ""),
  active: row.active !== false,
  scopes: toScopes(row.scopes),
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  lastUsedAt: row.last_used_at ? toDate(row.last_used_at) : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const resolveUpdatePatch = (patch: {
  name?: string;
  description?: string;
  active?: boolean;
  scopes?: string[];
}) => {
  const sets: string[] = [];
  const values: unknown[] = [];

  const add = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    add("name", patch.name);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    add("description", patch.description);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "active")) {
    add("active", patch.active === true);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "scopes")) {
    add("scopes", patch.scopes || []);
  }

  return {
    sets,
    values,
  };
};

export const createPostgresServiceAccountRepository = (): ServiceAccountRepository => ({
  listSortedByCreatedAtDesc: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      FROM service_accounts
      ORDER BY created_at DESC
      `,
    );
    return result.rows.map((row) => toRecord(row));
  },

  findById: async ({ accountId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      FROM service_accounts
      WHERE id = $1
      LIMIT 1
      `,
      [accountId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  findActiveById: async ({ accountId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      FROM service_accounts
      WHERE id = $1
        AND active = TRUE
      LIMIT 1
      `,
      [accountId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  create: async ({ name, description, active, scopes, createdByUserId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      INSERT INTO service_accounts (
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      `,
      [nanoid(), name, description, active === true, scopes, createdByUserId],
    );

    return toRecord(result.rows[0]);
  },

  updateById: async ({ accountId, patch }) => {
    const pool = await getPostgresPool();
    const { sets, values } = resolveUpdatePatch(patch);

    if (!sets.length) {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          description,
          active,
          scopes,
          created_by_user_id,
          last_used_at,
          created_at,
          updated_at
        FROM service_accounts
        WHERE id = $1
        LIMIT 1
        `,
        [accountId],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    }

    values.push(accountId);
    const result = await pool.query(
      `
      UPDATE service_accounts
      SET
        ${sets.join(",\n        ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      `,
      values,
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  deleteById: async ({ accountId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      DELETE FROM service_accounts
      WHERE id = $1
      RETURNING
        id,
        name,
        description,
        active,
        scopes,
        created_by_user_id,
        last_used_at,
        created_at,
        updated_at
      `,
      [accountId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  touchLastUsed: async ({ accountId, lastUsedAt }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE service_accounts
      SET
        last_used_at = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [accountId, lastUsedAt],
    );
  },
});
