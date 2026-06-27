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
 * first and the other simply skips already-applied migrations. Matching the CLI,
 * it also verifies that every already-applied migration still corresponds to a
 * packaged file with the same checksum, and aborts startup on drift (missing
 * file, changed checksum, or duplicate version) rather than booting against a
 * database that disagrees with the deployed code.
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
    // The build copies the .sql files next to the compiled output; their absence
    // means a broken image, not "nothing to do" — fail loudly rather than boot
    // against an unmigrated database.
    throw new Error(
      `Migrations directory not found at ${migrationsDir}. The packaged migration files are missing.`,
    );
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
  migrations.sort((a, b) => a.version.localeCompare(b.version));

  const seenVersions = new Set<string>();
  for (const migration of migrations) {
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version '${migration.version}' detected.`);
    }
    seenVersions.add(migration.version);
  }

  return migrations;
};

// Fixed key for the session advisory lock that serializes migrators, so several
// replicas booting at once don't race to apply the same migration.
const MIGRATION_ADVISORY_LOCK_KEY = 4771001;

/**
 * Apply every migration not yet recorded in `schema_migrations`, each in its own
 * transaction. Idempotent: a fully-migrated database is a no-op. A session-level
 * advisory lock serializes concurrent callers (the others wait, then see the
 * migrations already applied and skip them).
 */
export const applyPendingMigrations = async (): Promise<void> => {
  const migrations = loadMigrations();
  if (migrations.length === 0) {
    throw new Error("No migration files found; refusing to start against an unmigrated database.");
  }

  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const applied = await client.query<{ version: string; name: string; checksum: string }>(
      "SELECT version, name, checksum FROM schema_migrations",
    );

    // Verify every already-applied migration still matches a packaged file with
    // the same checksum (parity with `db:schema:apply`): a missing file or a
    // changed migration means the deployed code and the database disagree, which
    // must abort startup rather than apply a divergent schema. Migrations are
    // forward-only: an older image booting against a database that already has a
    // newer migration applied will refuse to start (run the newer image, or roll
    // the schema back with the `.down.sql` first).
    const migrationsByVersion = new Map(
      migrations.map((migration) => [migration.version, migration]),
    );
    for (const row of applied.rows) {
      const version = String(row.version);
      const file = migrationsByVersion.get(version);
      if (!file) {
        throw new Error(
          `Applied migration ${version}_${row.name} is missing from the packaged migration files. Refusing to start.`,
        );
      }
      if (file.checksum !== String(row.checksum)) {
        throw new Error(
          `Checksum mismatch for applied migration ${version}_${file.name}: the migration file changed after it was applied. Refusing to start.`,
        );
      }
    }

    const appliedVersions = new Set(applied.rows.map((row) => String(row.version)));
    const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));

    for (const migration of pending) {
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
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY]).catch(() => {
      // Best-effort unlock; the lock is released anyway when the session ends.
    });
    client.release();
  }
};
