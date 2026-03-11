/**
 * @file Development bootstrap script.
 * @description Starts a database via Docker Compose, then launches UI/API/Gateway services.
 */

import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const dockerCommand = isWindows ? "docker.exe" : "docker";
const npmExecPath = process.env.npm_execpath;
const npmNodeExecPath = process.env.npm_node_execpath || process.execPath;
const HELP_FLAGS = new Set(["--help", "-h"]);
const LOG_PREFIX = "[dev]";
const composeFile = "docker-compose.postgres.yml";
const composeArgs = ["compose", "-f", composeFile];
const dbServiceName = "postgres";
const dbLabel = "Postgres";

const resolveSecurityLimiterBackend = () => {
  const configured = String(process.env.SECURITY_LIMITER_BACKEND || "")
    .trim()
    .toLowerCase();

  if (configured === "memory") {
    return "memory";
  }
  if (configured === "postgres") {
    return "postgres";
  }
  return "postgres";
};

const devRuntimeEnv = Object.freeze({
  ...process.env,
  DB_BACKEND: "postgres",
  SECURITY_LIMITER_BACKEND: resolveSecurityLimiterBackend(),
});

let servicesProcess = null;
let isShuttingDown = false;

const printUsage = () => {
  console.log("Usage: npm run dev");
  console.log("");
  console.log("Starts Postgres via docker compose, runs migrations, then starts UI/API/Gateway.");
  console.log("On shutdown, dev services stop and the database container remains running.");
};

if (process.argv.some((arg) => HELP_FLAGS.has(arg))) {
  printUsage();
  process.exit(0);
}

const backendArg = process.argv.find((arg) => arg.startsWith("--backend="));
if (backendArg) {
  const requestedBackend = backendArg.slice("--backend=".length).trim().toLowerCase();
  if (requestedBackend !== "postgres") {
    console.error(
      "Mongo runtime bootstrap is deprecated. Use Postgres-only `npm run dev` flow for active development.",
    );
    process.exit(1);
  }
}

const envBackend = String(process.env.DEV_DB_BACKEND || process.env.DB_BACKEND || "")
  .trim()
  .toLowerCase();
if (envBackend && envBackend !== "postgres") {
  console.error(
    `DEV_DB_BACKEND/DB_BACKEND='${envBackend}' is unsupported for scripts/dev.mjs. Use postgres.`,
  );
  process.exit(1);
}

const getNpmRunCommand = (scriptName) => {
  // Preferred cross-platform path when launched via `npm run ...`.
  if (npmExecPath) {
    return {
      command: npmNodeExecPath,
      args: [npmExecPath, "run", scriptName],
    };
  }

  // Fallbacks for direct invocation (e.g. `node scripts/dev.mjs`).
  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", scriptName],
    };
  }

  return {
    command: "npm",
    args: ["run", scriptName],
  };
};

const run = (command, args, { stdio = "inherit", env = process.env } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio, env });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code ?? 0);
    });
  });

const waitForExit = (child, timeoutMs) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve(child?.exitCode ?? 0);
      return;
    }

    let settled = false;
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code ?? 0);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.off("exit", onExit);
      resolve(null);
    }, timeoutMs);

    child.once("exit", onExit);
  });

const stopServices = async () => {
  if (!servicesProcess || servicesProcess.exitCode !== null) {
    return;
  }

  servicesProcess.kill("SIGINT");
  let exitCode = await waitForExit(servicesProcess, 8000);
  if (exitCode !== null) {
    return;
  }

  servicesProcess.kill("SIGTERM");
  exitCode = await waitForExit(servicesProcess, 5000);
  if (exitCode !== null) {
    return;
  }

  if (isWindows && servicesProcess.pid) {
    await run("taskkill.exe", ["/PID", String(servicesProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else if (servicesProcess.pid) {
    // Negative PID targets the process group (requires detached child on POSIX).
    try {
      process.kill(-servicesProcess.pid, "SIGKILL");
    } catch {
      servicesProcess.kill("SIGKILL");
    }
  } else {
    servicesProcess.kill("SIGKILL");
  }

  await waitForExit(servicesProcess, 2000);
};

const shutdown = async (exitCode) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  await stopServices();

  console.log("");
  console.log(`${dbLabel} container is left running for faster iteration.`);
  console.log(`Use \`npm run dev:postgres:logs\` to inspect ${dbLabel} logs.`);
  console.log("Use `npm run dev:postgres:down` when done.");
  process.exit(exitCode);
};

process.on("SIGINT", () => {
  void shutdown(130);
});

process.on("SIGTERM", () => {
  void shutdown(143);
});

const main = async () => {
  console.log(`Starting ${dbLabel} container...`);
  const dbUpCode = await run(dockerCommand, [
    ...composeArgs,
    "up",
    "-d",
    "--build",
    "--wait",
    "--wait-timeout",
    "180",
  ]);

  if (dbUpCode !== 0) {
    console.error("");
    console.error(`${dbLabel} startup failed. Recent ${dbLabel} logs:`);
    await run(dockerCommand, [...composeArgs, "logs", "--tail", "200", dbServiceName]);
    process.exit(dbUpCode);
  }

  console.log("Applying PostgreSQL schema changes...");
  const npmRunMigrate = getNpmRunCommand("db:schema:apply");
  const migrateCode = await run(npmRunMigrate.command, npmRunMigrate.args, {
    env: devRuntimeEnv,
  });
  if (migrateCode !== 0) {
    console.error("");
    console.error("PostgreSQL schema apply failed. Recent Postgres logs:");
    await run(dockerCommand, [...composeArgs, "logs", "--tail", "200", dbServiceName]);
    process.exit(migrateCode);
  }

  console.log("");
  console.log("Development services:");
  console.log("- UI:    http://localhost:5173/");
  console.log("- API:   http://127.0.0.1:4001/graphql");
  console.log("- Gateway: http://127.0.0.1:8001/");
  console.log("- Postgres: postgresql://127.0.0.1:5432/freeboard (credentials from .env)");
  console.log("");

  const npmRunDevServices = getNpmRunCommand("dev:services");
  servicesProcess = spawn(npmRunDevServices.command, npmRunDevServices.args, {
    stdio: "inherit",
    detached: !isWindows,
    env: devRuntimeEnv,
  });

  servicesProcess.on("error", async (error) => {
    console.error(`${LOG_PREFIX} Failed to start development services.`, error);
    await shutdown(1);
  });

  servicesProcess.on("exit", async (code, signal) => {
    if (signal) {
      await shutdown(128);
      return;
    }

    const exitCode = code ?? 0;
    if (exitCode !== 0) {
      console.error("");
      console.error(`Development services exited with code ${exitCode}.`);
    }
    await shutdown(exitCode);
  });
};

try {
  await main();
} catch (error) {
  console.error(`${LOG_PREFIX} Development bootstrap failed.`, error);
  process.exit(1);
}
