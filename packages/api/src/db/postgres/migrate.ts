import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresPool } from "./client.js";

/**
 * @module db/postgres/migrate
 * @description Applies pending SQL migrations on startup so a fresh deployment
 * (e.g. `docker compose up`) provisions its own schema instead of crashing on a
 * missing table. Intentionally compatible with `npm run db:schema:apply`: same
 * `schema_migrations` table, version string, and checksum, so either may run
 * first and the other simply skips already-applied migrations.
 *
 * The migration `.sql` files are shipped next to the compiled output — the api
 * build copies `src/db/postgres/migrations/` into `dist/db/postgres/migrations/`.
 */

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

type Migration = { version: string; name: string; sql: string; checksum: string };

const computeChecksum = (content: string): string =>
  crypto.createHash("sha256").update(content, "utf8").digest("hex");

const loadMigrations = (): Migration[] => {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  const migrations: Migration[] = [];
  for (const filename of fs.readdirSync(migrationsDir)) {
    if (!filename.endsWith(".sql") || filename.endsWith(".down.sql")) {
      continue;
    }
    const match = filename.match(/^(\d{4})_(.+)\.sql$/);
    const version = match?.[1];
    const name = match?.[2];
    if (!version || !name) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8").trim();
    migrations.push({ version, name, sql, checksum: computeChecksum(sql) });
  }
  return migrations.sort((a, b) => a.version.localeCompare(b.version));
};

/**
 * Apply every migration not yet recorded in `schema_migrations`, each in its own
 * transaction. Idempotent: a fully-migrated database is a no-op.
 */
export const applyPendingMigrations = async (): Promise<void> => {
  const migrations = loadMigrations();
  if (migrations.length === 0) {
    return;
  }

  const pool = await getPostgresPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const applied = await pool.query<{ version: string }>("SELECT version FROM schema_migrations");
  const appliedVersions = new Set(applied.rows.map((row) => String(row.version)));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  if (pending.length === 0) {
    return;
  }

  for (const migration of pending) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO schema_migrations (version, name, checksum, applied_at)
         VALUES ($1, $2, $3, NOW())`,
        [migration.version, migration.name, migration.checksum],
      );
      await client.query("COMMIT");
      console.info(`Applied database migration ${migration.version}_${migration.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};
