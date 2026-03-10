#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const LOG_PREFIX = "[check-db-migration-readiness]";
const projectRoot = process.cwd();
const envFiles = [".env.dev", ".env"];

const allowedBackends = new Set(["mongo", "postgres"]);
const mongoUrlKeys = ["MONGO_URL", "FREEBOARD_MONGO_URL"];
const postgresUrlKeys = ["DATABASE_URL", "FREEBOARD_POSTGRES_URL"];

const parseBoolean = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const resolveStrictMode = (argv, env) =>
  argv.includes("--strict") || parseBoolean(env.DB_MIGRATION_READINESS_STRICT);

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

    const [, key, rawValue] = match;
    if (!key) {
      continue;
    }
    let value = String(rawValue || "").trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replaceAll("\\n", "\n");
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      // Drop inline comments for unquoted values.
      value = value.split(/\s+#/, 1)[0]?.trim() || "";
    }

    parsed[key] = value;
  }

  return parsed;
};

const mergeResolvedEnv = () => {
  const merged = {};
  for (const relativePath of envFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    Object.assign(merged, parseEnvFile(absolutePath));
  }
  Object.assign(merged, process.env);
  return merged;
};

const hasConfiguredValue = (env, keys) =>
  keys.some((key) => typeof env[key] === "string" && String(env[key]).trim() !== "");

const resolveBackend = ({
  explicitBackend,
  hasMongoUrl,
  hasPostgresUrl,
}) => {
  if (explicitBackend) {
    return explicitBackend;
  }
  if (hasMongoUrl && !hasPostgresUrl) {
    return "mongo";
  }
  if (hasPostgresUrl && !hasMongoUrl) {
    return "postgres";
  }
  if (hasMongoUrl && hasPostgresUrl) {
    return "ambiguous";
  }
  // Keep current repository default until backend cutover.
  return "mongo";
};

const main = () => {
  const resolvedEnv = mergeResolvedEnv();
  const strictMode = resolveStrictMode(process.argv.slice(2), resolvedEnv);

  const explicitBackendRaw = String(resolvedEnv.DB_BACKEND || "")
    .trim()
    .toLowerCase();
  const explicitBackend = explicitBackendRaw || null;

  const hasMongoUrl = hasConfiguredValue(resolvedEnv, mongoUrlKeys);
  const hasPostgresUrl = hasConfiguredValue(resolvedEnv, postgresUrlKeys);

  const errors = [];
  const warnings = [];

  if (explicitBackend && !allowedBackends.has(explicitBackend)) {
    errors.push(
      `DB_BACKEND='${explicitBackendRaw}' is invalid. Expected one of: mongo, postgres.`,
    );
  }

  const backend = resolveBackend({
    explicitBackend,
    hasMongoUrl,
    hasPostgresUrl,
  });

  if (backend === "ambiguous") {
    errors.push(
      "Both Mongo and Postgres connection URLs are configured without DB_BACKEND. Set DB_BACKEND explicitly.",
    );
  }

  if (strictMode && !explicitBackend) {
    errors.push("Strict mode requires explicit DB_BACKEND to avoid implicit defaults.");
  }

  if (backend === "mongo") {
    if (strictMode && !hasMongoUrl) {
      errors.push(
        `Backend is 'mongo' but no connection URL is configured. Set one of: ${mongoUrlKeys.join(", ")}.`,
      );
    }
    if (!strictMode && hasPostgresUrl && !hasMongoUrl) {
      errors.push(
        `Detected Postgres URL(s) but resolved backend is 'mongo'. Set DB_BACKEND=postgres or configure ${mongoUrlKeys[0]}.`,
      );
    }
  }

  if (backend === "postgres") {
    if (!hasPostgresUrl) {
      errors.push(
        `Backend is 'postgres' but no connection URL is configured. Set one of: ${postgresUrlKeys.join(", ")}.`,
      );
    }
  }

  if (explicitBackend && hasMongoUrl && hasPostgresUrl) {
    warnings.push(
      "Both Mongo and Postgres URLs are configured. This is acceptable during migration, but keep DB_BACKEND explicit.",
    );
  }

  if (!explicitBackend && !hasMongoUrl && !hasPostgresUrl) {
    warnings.push(
      "No DB connection URL is configured in local env files or process env. Using legacy default backend inference ('mongo').",
    );
  }

  console.log(`${LOG_PREFIX} backend=${backend} explicit=${Boolean(explicitBackend)} strict=${strictMode}`);
  console.log(`${LOG_PREFIX} mongoUrlConfigured=${hasMongoUrl} postgresUrlConfigured=${hasPostgresUrl}`);

  if (warnings.length > 0) {
    console.warn(`${LOG_PREFIX} warnings:`);
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error(`${LOG_PREFIX} failed:`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`${LOG_PREFIX} passed.`);
};

main();
