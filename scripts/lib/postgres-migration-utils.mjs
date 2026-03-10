import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DEFAULT_ENV_FILES = [".env.dev", ".env"];

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2];
    if (!key) {
      continue;
    }

    let value = String(rawValue || "").trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replaceAll("\\n", "\n");
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.split(/\s+#/, 1)[0]?.trim() || "";
    }

    parsed[key] = value;
  }

  return parsed;
};

export const loadResolvedEnv = () => {
  const merged = {};
  for (const relativePath of DEFAULT_ENV_FILES) {
    const absolutePath = path.join(PROJECT_ROOT, relativePath);
    Object.assign(merged, parseEnvFile(absolutePath));
  }
  Object.assign(merged, process.env);
  return merged;
};

export const resolveDatabaseUrl = () => {
  const resolvedEnv = loadResolvedEnv();
  const databaseUrl = String(
    resolvedEnv.DATABASE_URL || resolvedEnv.FREEBOARD_POSTGRES_URL || "",
  ).trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or FREEBOARD_POSTGRES_URL is required to run PostgreSQL migrations.",
    );
  }
  return databaseUrl;
};

export const resolveMigrationsDir = () =>
  path.join(PROJECT_ROOT, "packages/api/src/db/postgres/migrations");

export const ensureMigrationsTable = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const computeChecksum = (content) =>
  crypto.createHash("sha256").update(content, "utf8").digest("hex");

const parseMigrationFilename = (filename) => {
  if (!filename.endsWith(".sql") || filename.endsWith(".down.sql")) {
    return null;
  }

  const match = filename.match(/^(\d{4})_(.+)\.sql$/);
  if (!match) {
    return null;
  }

  const version = match[1];
  const name = match[2];
  if (!version || !name) {
    return null;
  }

  return { version, name };
};

export const loadMigrations = (migrationsDir = resolveMigrationsDir()) => {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrations = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const parsed = parseMigrationFilename(entry.name);
    if (!parsed) {
      continue;
    }

    const upPath = path.join(migrationsDir, entry.name);
    const downFilename = `${parsed.version}_${parsed.name}.down.sql`;
    const downPath = path.join(migrationsDir, downFilename);

    const upSql = fs.readFileSync(upPath, "utf8").trim();
    const downSql = fs.existsSync(downPath) ? fs.readFileSync(downPath, "utf8").trim() : null;

    migrations.push({
      version: parsed.version,
      name: parsed.name,
      upPath,
      downPath: fs.existsSync(downPath) ? downPath : null,
      upSql,
      downSql,
      checksum: computeChecksum(upSql),
    });
  }

  migrations.sort((left, right) => {
    if (left.version === right.version) {
      return left.name.localeCompare(right.name);
    }
    return left.version.localeCompare(right.version);
  });

  const seenVersions = new Set();
  for (const migration of migrations) {
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version '${migration.version}' detected.`);
    }
    seenVersions.add(migration.version);
  }

  return migrations;
};

export const listAppliedMigrations = async (pool) => {
  await ensureMigrationsTable(pool);
  const result = await pool.query(
    "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC",
  );
  return result.rows.map((row) => ({
    version: String(row.version || ""),
    name: String(row.name || ""),
    checksum: String(row.checksum || ""),
    appliedAt: row.applied_at || null,
  }));
};

export const formatMigrationLabel = (migration) => `${migration.version}_${migration.name}`;

const dynamicImport = async (specifier) => import(specifier);

const loadPoolConstructor = async () => {
  let importedModule;
  try {
    importedModule = await dynamicImport("pg");
  } catch (error) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message || "Unknown error")
        : "Unknown error";
    throw new Error(
      `PostgreSQL migration commands require the 'pg' package. Install it in packages/api before running migrations. Original error: ${errorMessage}`,
    );
  }

  const poolConstructor = importedModule?.Pool;
  if (typeof poolConstructor !== "function") {
    throw new Error("Failed to load PostgreSQL Pool constructor from 'pg'.");
  }

  return poolConstructor;
};

const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
};

export const createMigrationPool = async () => {
  const databaseUrl = resolveDatabaseUrl();
  const Pool = await loadPoolConstructor();

  const poolConfig = {
    connectionString: databaseUrl,
    connectionTimeoutMillis: normalizePositiveInteger(process.env.POSTGRES_CONNECT_TIMEOUT_MS, 30000),
    max: normalizePositiveInteger(
      process.env.POSTGRES_POOL_MAX_CONNECTIONS || process.env.POSTGRES_POOL_MAX,
      5,
    ),
    idleTimeoutMillis: normalizePositiveInteger(process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS, 30000),
  };

  const sslMode = String(process.env.POSTGRES_SSL_MODE || process.env.PGSSLMODE || "")
    .trim()
    .toLowerCase();
  if (sslMode === "require") {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return new Pool(poolConfig);
};

export const applyMigrationUp = async (pool, migration) => {
  await pool.query("BEGIN");
  try {
    await pool.query(migration.upSql);
    await pool.query(
      `INSERT INTO schema_migrations (version, name, checksum, applied_at)
       VALUES ($1, $2, $3, NOW())`,
      [migration.version, migration.name, migration.checksum],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};

export const applyMigrationDown = async (pool, migration) => {
  if (!migration.downSql) {
    throw new Error(
      `Migration '${formatMigrationLabel(migration)}' has no down script (${migration.version}_${migration.name}.down.sql).`,
    );
  }

  await pool.query("BEGIN");
  try {
    // Remove migration marker first so down scripts may safely drop schema_migrations.
    await pool.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version]);
    await pool.query(migration.downSql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};
