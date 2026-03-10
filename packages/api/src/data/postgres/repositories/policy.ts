import { getPostgresPool } from "../../../db/postgres/client.js";
import type { PolicyRepository } from "../../contracts.js";

const serializePolicyValue = (value: unknown): string => {
  const normalized = value === undefined ? null : value;
  try {
    const serialized = JSON.stringify(normalized);
    return serialized === undefined ? "null" : serialized;
  } catch (error) {
    throw new Error("Policy value must be JSON-serializable.", { cause: error });
  }
};

export const createPostgresPolicyRepository = (): PolicyRepository => ({
  readValue: async ({ key }) => {
    const pool = await getPostgresPool();
    const result = await pool.query<{ value: unknown }>(
      `
      SELECT value
      FROM policy_kv
      WHERE key = $1
      LIMIT 1
      `,
      [key],
    );

    return result.rows[0]?.value;
  },

  writeValue: async ({ key, value, updatedBy = null }) => {
    const pool = await getPostgresPool();
    const serializedValue = serializePolicyValue(value);
    await pool.query(
      `
      INSERT INTO policy_kv (key, value, updated_by, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW(), NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      `,
      [key, serializedValue, updatedBy],
    );
  },
});
