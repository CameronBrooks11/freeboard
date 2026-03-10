import { URL } from "node:url";
import { config } from "../../config.js";

type PgQueryResultRow = Record<string, unknown>;

type PgQueryResult<T extends PgQueryResultRow = PgQueryResultRow> = {
  rows: T[];
  rowCount: number | null;
};

type PgClientLike = {
  query: <T extends PgQueryResultRow = PgQueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ) => Promise<PgQueryResult<T>>;
  release: () => void;
};

type PgPoolLike = {
  query: <T extends PgQueryResultRow = PgQueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ) => Promise<PgQueryResult<T>>;
  connect: () => Promise<PgClientLike>;
  end: () => Promise<void>;
};

type PgPoolConstructor = new (poolConfig: Record<string, unknown>) => PgPoolLike;

const dynamicImport = async (specifier: string): Promise<unknown> => import(specifier);

const loadPgPoolConstructor = async (): Promise<PgPoolConstructor> => {
  let importedModule: unknown;
  try {
    importedModule = await dynamicImport("pg");
  } catch (error) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: string }).message || "Unknown error")
        : "Unknown error";
    throw new Error(
      `PostgreSQL backend requires the 'pg' package. Install it in packages/api before using DB_BACKEND=postgres. Original error: ${errorMessage}`,
      {
        cause: error,
      },
    );
  }

  const poolConstructor = (importedModule as { Pool?: unknown }).Pool;
  if (typeof poolConstructor !== "function") {
    throw new Error("Failed to load PostgreSQL Pool constructor from 'pg'.");
  }
  return poolConstructor as PgPoolConstructor;
};

const resolveSslConfig = (): Record<string, unknown> | undefined => {
  const sslMode = String(process.env.POSTGRES_SSL_MODE || process.env.PGSSLMODE || "")
    .trim()
    .toLowerCase();
  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }
  return undefined;
};

const normalizePositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
};

const createPoolConfig = (): Record<string, unknown> => {
  if (!config.postgresUrl) {
    throw new Error(
      "DATABASE_URL or FREEBOARD_POSTGRES_URL must be configured for postgres backend.",
    );
  }

  const poolConfig: Record<string, unknown> = {
    connectionString: config.postgresUrl,
    connectionTimeoutMillis: config.postgresConnectTimeoutMs,
    max: normalizePositiveInteger(
      process.env.POSTGRES_POOL_MAX_CONNECTIONS || process.env.POSTGRES_POOL_MAX,
      10,
    ),
    idleTimeoutMillis: normalizePositiveInteger(process.env.POSTGRES_POOL_IDLE_TIMEOUT_MS, 30_000),
  };

  const ssl = resolveSslConfig();
  if (ssl) {
    poolConfig.ssl = ssl;
  }

  return poolConfig;
};

let postgresPoolPromise: Promise<PgPoolLike> | null = null;

export const getPostgresPool = async (): Promise<PgPoolLike> => {
  if (!postgresPoolPromise) {
    postgresPoolPromise = (async () => {
      const Pool = await loadPgPoolConstructor();
      return new Pool(createPoolConfig());
    })().catch((error) => {
      postgresPoolPromise = null;
      throw error;
    });
  }

  return postgresPoolPromise;
};

export const closePostgresPool = async (): Promise<void> => {
  if (!postgresPoolPromise) {
    return;
  }

  const poolPromise = postgresPoolPromise;
  postgresPoolPromise = null;
  const pool = await poolPromise;
  await pool.end();
};

export const verifyPostgresConnectivity = async (): Promise<{ durationMs: number }> => {
  const startedAt = Date.now();
  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT 1 AS ok");
  } finally {
    client.release();
  }

  return {
    durationMs: Date.now() - startedAt,
  };
};

export const describePostgresConnectionTarget = (): string | null => {
  if (!config.postgresUrl) {
    return null;
  }

  try {
    const parsed = new URL(config.postgresUrl);
    const databaseName = parsed.pathname.replace(/^\//, "") || "(default)";
    const host = parsed.hostname || "localhost";
    const port = parsed.port || "5432";
    return `${host}:${port}/${databaseName}`;
  } catch {
    return "[invalid-postgres-url]";
  }
};
