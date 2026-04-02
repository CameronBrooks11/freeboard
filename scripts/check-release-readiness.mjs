#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { URL } from "node:url";

const LOG_PREFIX = "[check:release]";
const isWindows = process.platform === "win32";
const dockerCommand = isWindows ? "docker.exe" : "docker";

const sanitizeExecPath = (p) => {
  if (!p || typeof p !== "string") return null;
  const trimmed = p.trim();
  if (!path.isAbsolute(trimmed)) return null;
  if (/[\s;&|<>`$\\*?{}[\]()!#~'"^]/.test(trimmed)) return null;
  return trimmed;
};

const npmExecPath = sanitizeExecPath(process.env.npm_execpath);
const npmNodeExecPath = sanitizeExecPath(process.env.npm_node_execpath) ?? process.execPath;
const E2E_POSTGRES_PORT_DEFAULT = 55432;

const resolveSecurityLimiterBackend = () => {
  const configured = String(process.env.SECURITY_LIMITER_BACKEND || "")
    .trim()
    .toLowerCase();
  if (configured === "memory") {
    return "memory";
  }
  return "postgres";
};

const hasPostgresUrl =
  String(process.env.DATABASE_URL || "").trim() !== "" ||
  String(process.env.FREEBOARD_POSTGRES_URL || "").trim() !== "";

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const toSafePort = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > 65535) {
    return fallback;
  }
  return normalized;
};

const buildE2EDatabaseUrl = (baseUrl, port) => {
  try {
    const parsed = new URL(baseUrl);
    parsed.hostname = "127.0.0.1";
    parsed.port = String(port);
    return parsed.toString();
  } catch {
    return `postgresql://postgres:postgres@127.0.0.1:${port}/freeboard`;
  }
};

const resolveComposePostgresSettings = (urlString) => {
  try {
    const parsed = new URL(urlString);
    const username = decodeURIComponent(parsed.username || "postgres").trim() || "postgres";
    const password = decodeURIComponent(parsed.password || "postgres");
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "") || "freeboard")
      .trim()
      .replaceAll("/", "_");
    return {
      username,
      password: password || "postgres",
      database: database || "freeboard",
    };
  } catch {
    return {
      username: "postgres",
      password: "postgres",
      database: "freeboard",
    };
  }
};

const normalizeEnv = (inputEnv) => {
  const normalized = {};
  for (const [key, value] of Object.entries(inputEnv || {})) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
};

const getNpmRunCommand = (scriptName, scriptArgs = []) => {
  if (npmExecPath) {
    return {
      command: npmNodeExecPath,
      args: [npmExecPath, "run", scriptName, ...scriptArgs],
    };
  }

  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", scriptName, ...scriptArgs],
    };
  }

  return {
    command: "npm",
    args: ["run", scriptName, ...scriptArgs],
  };
};

const run = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });

const parseArgs = (argv) => {
  const args = new Set(argv);
  return {
    skipE2E: args.has("--skip-e2e"),
    bootstrapPostgres: args.has("--no-bootstrap-postgres")
      ? false
      : args.has("--bootstrap-postgres")
        ? true
        : parseBoolean(process.env.CHECK_RELEASE_BOOTSTRAP_POSTGRES, true),
  };
};

const main = async () => {
  const { skipE2E, bootstrapPostgres } = parseArgs(process.argv.slice(2));

  if (!hasPostgresUrl && !bootstrapPostgres) {
    throw new Error(
      "DATABASE_URL or FREEBOARD_POSTGRES_URL must be configured before running release readiness checks.",
    );
  }

  const baseRuntimeEnv = normalizeEnv({
    ...process.env,
    DB_BACKEND: "postgres",
    SECURITY_LIMITER_BACKEND: resolveSecurityLimiterBackend(),
  });
  const configuredPostgresUrl = String(
    baseRuntimeEnv.DATABASE_URL || baseRuntimeEnv.FREEBOARD_POSTGRES_URL || "",
  ).trim();
  const e2ePostgresPort = toSafePort(
    process.env.CHECK_RELEASE_E2E_POSTGRES_PORT,
    E2E_POSTGRES_PORT_DEFAULT,
  );
  const composeSettings = resolveComposePostgresSettings(configuredPostgresUrl);
  const e2eDatabaseUrl = buildE2EDatabaseUrl(configuredPostgresUrl, e2ePostgresPort);
  const e2ePostgresEnv = normalizeEnv({
    FREEBOARD_POSTGRES_PORT: String(e2ePostgresPort),
    POSTGRES_USER: composeSettings.username,
    POSTGRES_PASSWORD: composeSettings.password,
    POSTGRES_DB: composeSettings.database,
    DATABASE_URL: e2eDatabaseUrl,
  });

  const runtimeEnv = bootstrapPostgres
    ? normalizeEnv({
        ...baseRuntimeEnv,
        ...e2ePostgresEnv,
      })
    : baseRuntimeEnv;
  const e2eRuntimeEnv = normalizeEnv({
    ...runtimeEnv,
    ...e2ePostgresEnv,
  });

  const matrix = [
    "check:db:ready:strict",
    "db:schema:status",
    "db:schema:apply",
    "db:schema:status",
    "format:check",
    "lint",
    "check:ts:debt",
    "check:ts:source-artifacts",
    "test:shared",
    "test:api",
    "test:api:smoke",
    "test:ui",
    "test:gateway",
    ...(skipE2E ? [] : ["test:e2e:smoke"]),
    "build:verify",
    "typecheck",
    "db:schema:status",
  ];

  console.log(
    `${LOG_PREFIX} running ${matrix.length} command(s) with DB_BACKEND=postgres` +
      (skipE2E ? " (e2e skipped)" : ""),
  );
  console.log(
    `${LOG_PREFIX} postgres bootstrap=${bootstrapPostgres} (set CHECK_RELEASE_BOOTSTRAP_POSTGRES=0 to disable).`,
  );
  if (!skipE2E) {
    console.log(
      `${LOG_PREFIX} e2e postgres host port=${e2ePostgresPort} (set CHECK_RELEASE_E2E_POSTGRES_PORT to override).`,
    );
  }

  const runValidationMatrix = async () => {
    for (const scriptName of matrix) {
      const npmCommand = getNpmRunCommand(scriptName);
      const label = `npm run ${scriptName}`;
      console.log(`${LOG_PREFIX} ${label}`);
      const commandEnv = scriptName === "test:e2e:smoke" ? e2eRuntimeEnv : runtimeEnv;
      await run(npmCommand.command, npmCommand.args, commandEnv);
    }
  };

  const runCompose = async (composeArgs) => {
    await run(
      dockerCommand,
      ["compose", "-f", "docker-compose.postgres.yml", ...composeArgs],
      e2eRuntimeEnv,
    );
  };

  if (!bootstrapPostgres) {
    await runValidationMatrix();
    console.log(`${LOG_PREFIX} passed.`);
    return;
  }

  let matrixError = null;
  try {
    console.log(`${LOG_PREFIX} bootstrapping postgres test container...`);
    await runCompose(["down", "-v", "--remove-orphans", "--timeout", "10"]);
    await runCompose(["up", "-d", "--build", "--wait", "--wait-timeout", "180"]);
    await runValidationMatrix();
  } catch (error) {
    matrixError = error;
  } finally {
    try {
      console.log(`${LOG_PREFIX} stopping postgres test container...`);
      await runCompose(["down", "--timeout", "10"]);
    } catch (cleanupError) {
      if (!matrixError) {
        matrixError = cleanupError;
      } else {
        console.error(
          `${LOG_PREFIX} warning: postgres cleanup failed: ${
            cleanupError?.message || cleanupError
          }`,
        );
      }
    }
  }

  if (matrixError) {
    throw matrixError;
  }

  console.log(`${LOG_PREFIX} passed.`);
};

main().catch((error) => {
  console.error(`${LOG_PREFIX} failed.`);
  console.error(error?.message || error);
  process.exit(1);
});
