#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const LOG_PREFIX = "[check-db-migration-readiness]";
const projectRoot = process.cwd();
const envFiles = [".env.dev", ".env"];

const allowedBackends = new Set(["postgres"]);
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

const resolveBackend = (explicitBackend) => explicitBackend || "postgres";

const main = () => {
  const resolvedEnv = mergeResolvedEnv();
  const strictMode = resolveStrictMode(process.argv.slice(2), resolvedEnv);

  const explicitBackendRaw = String(resolvedEnv.DB_BACKEND || "").trim().toLowerCase();
  const explicitBackend = explicitBackendRaw || null;

  const hasMongoUrl = hasConfiguredValue(resolvedEnv, mongoUrlKeys);
  const hasPostgresUrl = hasConfiguredValue(resolvedEnv, postgresUrlKeys);

  const errors = [];
  const warnings = [];

  if (explicitBackend && !allowedBackends.has(explicitBackend)) {
    errors.push(`DB_BACKEND='${explicitBackendRaw}' is invalid. Expected: postgres.`);
  }

  const backend = resolveBackend(explicitBackend);

  if (strictMode && !explicitBackend) {
    errors.push("Strict mode requires explicit DB_BACKEND to avoid implicit defaults.");
  }

  if (!hasPostgresUrl) {
    errors.push(
      `Postgres runtime requires a connection URL. Set one of: ${postgresUrlKeys.join(", ")}.`,
    );
  }

  if (hasMongoUrl && hasPostgresUrl) {
    warnings.push(
      "Both Mongo and Postgres URLs are configured. Mongo URLs are ignored in active runtime paths.",
    );
  }

  if (hasMongoUrl && !hasPostgresUrl) {
    warnings.push(
      "Mongo URLs are configured without Postgres URL. Active runtime paths are Postgres-only and will fail until Postgres URL is set.",
    );
  }

  if (!explicitBackend && !hasPostgresUrl) {
    warnings.push(
      "No DB_BACKEND is configured; defaulting to postgres for readiness checks.",
    );
  }

  console.log(
    `${LOG_PREFIX} backend=${backend} explicit=${Boolean(explicitBackend)} strict=${strictMode}`,
  );
  console.log(
    `${LOG_PREFIX} mongoUrlConfigured=${hasMongoUrl} postgresUrlConfigured=${hasPostgresUrl}`,
  );

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
