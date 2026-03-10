import { getPostgresPool } from "../../../db/postgres/client.js";
import { nanoid } from "nanoid";
import type { BrokerProfileRecord, BrokerProfileRepository } from "../../contracts.js";

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

const toTopicAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toRecord = (row: {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  protocol?: unknown;
  broker_url?: unknown;
  tls?: unknown;
  credential_profile_id?: unknown;
  allow_public_use?: unknown;
  topic_allowlist?: unknown;
  created_by?: unknown;
  updated_by?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): BrokerProfileRecord => ({
  _id: String(row.id || ""),
  name: String(row.name || ""),
  description: String(row.description || ""),
  protocol: String(row.protocol || "mqtt"),
  brokerUrl: String(row.broker_url || ""),
  tls: toObjectRecord(row.tls),
  credentialProfileId: row.credential_profile_id ? String(row.credential_profile_id) : null,
  allowPublicUse: row.allow_public_use === true,
  topicAllowlist: toTopicAllowlist(row.topic_allowlist),
  createdBy: row.created_by ? String(row.created_by) : null,
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const resolveUpdatePatch = (patch: {
  name?: string;
  description?: string;
  protocol?: string;
  brokerUrl?: string;
  tls?: Record<string, unknown>;
  credentialProfileId?: string | null;
  allowPublicUse?: boolean;
  topicAllowlist?: string[];
  updatedBy?: string | null;
}) => {
  const sets: string[] = [];
  const values: unknown[] = [];

  const add = ({ column, value, cast = "" }: { column: string; value: unknown; cast?: string }) => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    add({ column: "name", value: patch.name });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    add({ column: "description", value: patch.description });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "protocol")) {
    add({ column: "protocol", value: patch.protocol });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "brokerUrl")) {
    add({ column: "broker_url", value: patch.brokerUrl });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "tls")) {
    add({ column: "tls", value: patch.tls || {} });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "credentialProfileId")) {
    add({ column: "credential_profile_id", value: patch.credentialProfileId || null });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "allowPublicUse")) {
    add({ column: "allow_public_use", value: patch.allowPublicUse === true });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "topicAllowlist")) {
    add({
      column: "topic_allowlist",
      value: JSON.stringify(patch.topicAllowlist || []),
      cast: "::jsonb",
    });
  }
  if (Object.prototype.hasOwnProperty.call(patch, "updatedBy")) {
    add({ column: "updated_by", value: patch.updatedBy || null });
  }

  return {
    sets,
    values,
  };
};

export const createPostgresBrokerProfileRepository = (): BrokerProfileRepository => ({
  listSortedByName: async ({ protocol = null }) => {
    const pool = await getPostgresPool();

    if (!protocol) {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          description,
          protocol,
          broker_url,
          tls,
          credential_profile_id,
          allow_public_use,
          topic_allowlist,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM broker_profiles
        ORDER BY name ASC
        `,
      );
      return result.rows.map((row) => toRecord(row));
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM broker_profiles
      WHERE protocol = $1
      ORDER BY name ASC
      `,
      [protocol],
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
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM broker_profiles
      WHERE id = $1
      LIMIT 1
      `,
      [profileId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  findByIds: async ({ profileIds }) => {
    const normalizedIds = profileIds.map((entry) => String(entry || "").trim()).filter(Boolean);
    if (!normalizedIds.length) {
      return [];
    }

    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM broker_profiles
      WHERE id = ANY($1::text[])
      `,
      [normalizedIds],
    );

    return result.rows.map((row) => toRecord(row));
  },

  create: async ({
    name,
    description,
    protocol,
    brokerUrl,
    tls,
    credentialProfileId,
    allowPublicUse,
    topicAllowlist,
    createdBy,
    updatedBy,
  }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      INSERT INTO broker_profiles (
        id,
        name,
        description,
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, NOW(), NOW())
      RETURNING
        id,
        name,
        description,
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
        created_by,
        updated_by,
        created_at,
        updated_at
      `,
      [
        nanoid(),
        name,
        description,
        protocol,
        brokerUrl,
        tls,
        credentialProfileId,
        allowPublicUse === true,
        JSON.stringify(topicAllowlist || []),
        createdBy,
        updatedBy,
      ],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error("Failed to create broker profile");
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
          protocol,
          broker_url,
          tls,
          credential_profile_id,
          allow_public_use,
          topic_allowlist,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM broker_profiles
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
      UPDATE broker_profiles
      SET
        ${sets.join(",\n        ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING
        id,
        name,
        description,
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
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
      DELETE FROM broker_profiles
      WHERE id = $1
      RETURNING
        id,
        name,
        description,
        protocol,
        broker_url,
        tls,
        credential_profile_id,
        allow_public_use,
        topic_allowlist,
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
