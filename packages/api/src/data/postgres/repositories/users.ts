import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getPostgresPool } from "../../../db/postgres/client.js";
import type { UserRecord, UserRepository } from "../../contracts.js";

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
  email?: unknown;
  password?: unknown;
  role?: unknown;
  active?: unknown;
  session_version?: unknown;
  registration_date?: unknown;
  last_login?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): UserRecord => ({
  _id: String(row.id || ""),
  email: String(row.email || ""),
  password: String(row.password || ""),
  role: String(row.role || "viewer"),
  active: row.active !== false,
  sessionVersion: Math.max(0, Math.floor(Number(row.session_version) || 0)),
  registrationDate: toDate(row.registration_date),
  lastLogin: toDate(row.last_login),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at, toDate(row.created_at)),
});

const toCount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
};

const USER_SELECT_FIELDS = `
  id,
  email,
  password,
  role,
  active,
  session_version,
  registration_date,
  last_login,
  created_at,
  updated_at
`;

export const createPostgresUserRepository = (): UserRepository => ({
  listAll: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      `,
    );

    return result.rows.map((row) => toRecord(row));
  },

  countAll: async () => {
    const pool = await getPostgresPool();
    const result = await pool.query<{ count: unknown }>(
      `
      SELECT COUNT(*) AS count
      FROM users
      `,
    );

    return toCount(result.rows[0]?.count);
  },

  countActiveAdminsExcludingUser: async ({ excludedUserId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query<{ count: unknown }>(
      `
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'admin'
        AND active = TRUE
        AND id <> $1
      `,
      [excludedUserId],
    );

    return toCount(result.rows[0]?.count);
  },

  findFirstActiveAdmin: async ({ excludedUserId = null }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      WHERE role = 'admin'
        AND active = TRUE
        AND ($1::text IS NULL OR id <> $1)
      ORDER BY registration_date ASC
      LIMIT 1
      `,
      [excludedUserId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  findByIds: async ({ userIds }) => {
    const normalizedIds = userIds.map((entry) => String(entry || "").trim()).filter(Boolean);
    if (!normalizedIds.length) {
      return [];
    }

    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      WHERE id = ANY($1::text[])
      `,
      [normalizedIds],
    );

    return result.rows.map((row) => toRecord(row));
  },

  findById: async ({ userId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  findActiveById: async ({ userId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      WHERE id = $1
        AND active = TRUE
      LIMIT 1
      `,
      [userId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  findByEmail: async ({ email }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  findActiveByEmail: async ({ email }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      SELECT ${USER_SELECT_FIELDS}
      FROM users
      WHERE email = $1
        AND active = TRUE
      LIMIT 1
      `,
      [email],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  create: async ({ email, password, role, active }) => {
    const pool = await getPostgresPool();
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `
      INSERT INTO users (
        id,
        email,
        password,
        role,
        active,
        session_version,
        registration_date,
        last_login,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW(), NOW(), NOW())
      RETURNING ${USER_SELECT_FIELDS}
      `,
      [nanoid(), email, passwordHash, role, active === true],
    );

    const createdRow = result.rows[0];
    if (!createdRow) {
      throw new Error("Failed to create user");
    }
    return toRecord(createdRow);
  },

  updateById: async ({ userId, patch, incrementSessionVersion = false }) => {
    const pool = await getPostgresPool();
    const sets: string[] = [];
    const values: unknown[] = [];

    const add = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(patch, "role")) {
      add("role", patch.role);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "active")) {
      add("active", patch.active === true);
    }
    if (incrementSessionVersion) {
      sets.push("session_version = session_version + 1");
    }

    if (!sets.length) {
      const result = await pool.query(
        `
        SELECT ${USER_SELECT_FIELDS}
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [userId],
      );

      return result.rows[0] ? toRecord(result.rows[0]) : null;
    }

    values.push(userId);
    const result = await pool.query(
      `
      UPDATE users
      SET
        ${sets.join(",\n        ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING ${USER_SELECT_FIELDS}
      `,
      values,
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  deleteById: async ({ userId }) => {
    const pool = await getPostgresPool();
    const result = await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING ${USER_SELECT_FIELDS}
      `,
      [userId],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },

  touchLastLogin: async ({ userId, lastLogin }) => {
    const pool = await getPostgresPool();
    await pool.query(
      `
      UPDATE users
      SET
        last_login = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [userId, lastLogin],
    );
  },

  setPasswordAndIncrementSessionVersion: async ({ userId, password }) => {
    const pool = await getPostgresPool();
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `
      UPDATE users
      SET
        password = $2,
        session_version = session_version + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING ${USER_SELECT_FIELDS}
      `,
      [userId, passwordHash],
    );

    return result.rows[0] ? toRecord(result.rows[0]) : null;
  },
});
