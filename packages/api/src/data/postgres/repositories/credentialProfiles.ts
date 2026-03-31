import { getPostgresPool } from "../../../db/postgres/client.js";
import { nanoid } from "nanoid";
import type { CredentialProfileRecord, CredentialProfileRepository } from "../../contracts.js";

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
  name?: unknown;
  description?: unknown;
  type?: unknown;
  allow_public_use?: unknown;
  metadata?: unknown;
  secret?: unknown;
  created_by?: unknown;
  updated_by?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): CredentialProfileRecord => ({
  _id: String(row.id || ""),
  name: String(row.name || ""),
  description: String(row.description || ""),
  type: String(row.type || "none"),
  allowPublicUse: row.allow_public_use === true,
  metadata:
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {},
  secret:
    row.secret && typeof row.secret === "object" && !Array.isArray(row.secret)
      ? (row.secret as Record<string, unknown>)
      : {},
  createdBy: row.created_by ? String(row.created_by) : null,
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const resolveUpdatePatch = (patch: {
  name?: string;
  description?: string;
  type?: string;
  allowPublicUse?: boolean;
  metadata?: Record<string, unknown>;
  secret?: Record<string, unknown>;
  updatedBy?: string | null;
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
  if (Object.prototype.hasOwnProperty.call(patch, "type")) {
    add("type", patch.type);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "allowPublicUse")) {
    add("allow_public_use", patch.allowPublicUse === true);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "metadata")) {
    add("metadata", patch.metadata || {});
  }
  if (Object.prototype.hasOwnProperty.call(patch, "secret")) {
    add("secret", patch.secret || {});
  }
  if (Object.prototype.hasOwnProperty.call(patch, "updatedBy")) {
    add("updated_by", patch.updatedBy || null);
  }

  return {
    sets,
    values,
  };
};

export const createPostgresCredentialProfileRepository = (): CredentialProfileRepository => ({
  listSortedByName: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        type,
        allow_public_use,
        metadata,
        secret,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM credential_profiles
      ORDER BY name ASC
      `,
    );
    return result.rows.map((row) => toRecord(row));
  },

  findById: async ({ profileId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        type,
        allow_public_use,
        metadata,
        secret,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM credential_profiles
      WHERE id = $1
      LIMIT 1
      `,
      [profileId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  create: async ({
    name,
    description,
    type,
    allowPublicUse,
    metadata,
    secret,
    createdBy,
    updatedBy,
  }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      INSERT INTO credential_profiles (
        id,
        name,
        description,
        type,
        allow_public_use,
        metadata,
        secret,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING
        id,
        name,
        description,
        type,
        allow_public_use,
        metadata,
        secret,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
      [
        nanoid(),
        name,
        description,
        type,
        allowPublicUse === true,
        metadata,
        secret,
        createdBy,
        updatedBy,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error("Failed to create credential profile");
    }
    return toRecord(createdRow);
  },

  updateById: async ({ profileId, patch }) => {
    const pool = await getPostgresPool();
    const { sets, values } = resolveUpdatePatch(patch);

    if (!sets.length) {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          description,
          type,
          allow_public_use,
          metadata,
          secret,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM credential_profiles
        WHERE id = $1
        LIMIT 1
        `,
        [profileId],
      );
      return result.rows[0] ? toRecord(result.rows[0]) : null;
    }

    values.push(profileId);
    const result = await pool.query(
      `
      UPDATE credential_profiles
      SET
        ${sets.join(",\n        ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING
        id,
        name,
        description,
        type,
        allow_public_use,
        metadata,
        secret,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
      values,
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  deleteById: async ({ profileId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      DELETE FROM credential_profiles
      WHERE id = $1
      RETURNING
        id,
        name,
        description,
        type,
        allow_public_use,
        metadata,
        secret,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
      [profileId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },
});
