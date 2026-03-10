import { getPostgresPool } from "../../../db/postgres/client.js";
import type { PolicyRepository } from "../../contracts.js";

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
    await pool.query(
      `
      INSERT INTO policy_kv (key, value, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      `,
      [key, value, updatedBy],
    );
  },
});
