/**
 * @module scripts/e2e-smoke
 * @description Deterministic local/CI bootstrap for browser smoke E2E tests.
 */

import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const dockerCmd = isWindows ? "docker.exe" : "docker";

const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
const E2E_API_URL = process.env.E2E_API_URL || "http://127.0.0.1:4001/graphql";
const E2E_GATEWAY_URL = process.env.E2E_GATEWAY_URL || "http://127.0.0.1:8001";
const E2E_STARTUP_TIMEOUT_MS = Number(process.env.E2E_STARTUP_TIMEOUT_MS || 180000);
const KEEP_DB_UP = String(process.env.E2E_KEEP_DB_UP || "").toLowerCase() === "true";
const composeFile = "docker-compose.postgres.yml";
const requestedBackend = String(process.env.E2E_DB_BACKEND || process.env.DB_BACKEND || "")
  .trim()
  .toLowerCase();
if (requestedBackend && requestedBackend !== "postgres") {
  throw new Error(
    `E2E_DB_BACKEND/DB_BACKEND='${requestedBackend}' is unsupported for scripts/e2e-smoke.mjs. Use postgres.`,
  );
}

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

const e2eRuntimeEnv = normalizeEnv({
  ...process.env,
  DB_BACKEND: "postgres",
  SECURITY_LIMITER_BACKEND: resolveSecurityLimiterBackend(),
});

const runningChildren = [];

const run = (command, args, { env = process.env, inheritStdio = true } = {}) =>
  new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: inheritStdio ? "inherit" : "pipe",
        env,
      });
    } catch (error) {
      reject(error);
      return;
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });

const startProcess = (command, args, { env = process.env, label = null } = {}) => {
  const child = spawn(command, args, {
    stdio: "inherit",
    env,
  });
  child.on("error", (error) => {
    const processLabel = label || `${command} ${args.join(" ")}`;
    console.error(`Failed to start process: ${processLabel}`);
    console.error(error?.message || error);
  });
  runningChildren.push(child);
  return child;
};

const runNpmScript = async (scriptName, { env = e2eRuntimeEnv } = {}) => {
  const npmRun = getNpmRunCommand(scriptName);
  await run(npmRun.command, npmRun.args, { env });
};

const startNpmScript = (scriptName, { env = e2eRuntimeEnv } = {}) => {
  const npmRun = getNpmRunCommand(scriptName);
  return startProcess(npmRun.command, npmRun.args, {
    env,
    label: `npm run ${scriptName}`,
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // Keep polling.
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const stopChildren = async () => {
  const children = runningChildren.splice(0);
  for (const child of children) {
    if (child.killed || child.exitCode !== null) {
      continue;
    }
    child.kill("SIGTERM");
  }

  await sleep(1500);

  for (const child of children) {
    if (child.killed || child.exitCode !== null) {
      continue;
    }
    child.kill("SIGKILL");
  }
};

const stopDatabase = async () => {
  if (KEEP_DB_UP) {
    return;
  }
  await run(dockerCmd, ["compose", "-f", composeFile, "down", "--timeout", "10"]);
};

let shuttingDown = false;
const shutdown = async (code = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    await stopChildren();
    await stopDatabase();
  } finally {
    process.exit(code);
  }
};

process.on("SIGINT", () => {
  void shutdown(130);
});
process.on("SIGTERM", () => {
  void shutdown(143);
});

const main = async () => {
  await run(dockerCmd, [
    "compose",
    "-f",
    composeFile,
    "down",
    "-v",
    "--remove-orphans",
    "--timeout",
    "10",
  ]);
  await run(dockerCmd, [
    "compose",
    "-f",
    composeFile,
    "up",
    "-d",
    "--build",
    "--wait",
    "--wait-timeout",
    "180",
  ]);

  await runNpmScript("db:schema:apply", { env: e2eRuntimeEnv });

  startNpmScript("dev:api", { env: e2eRuntimeEnv });
  startNpmScript("dev:gateway", { env: e2eRuntimeEnv });
  startNpmScript("dev:ui", { env: e2eRuntimeEnv });

  await waitForHttp(E2E_BASE_URL, E2E_STARTUP_TIMEOUT_MS);
  await waitForHttp(E2E_API_URL, E2E_STARTUP_TIMEOUT_MS);
  await waitForHttp(E2E_GATEWAY_URL, E2E_STARTUP_TIMEOUT_MS);

  await runNpmScript("test:e2e", { env: e2eRuntimeEnv });
};

try {
  await main();
  await shutdown(0);
} catch (error) {
  console.error("E2E smoke bootstrap failed:", error?.message || error);
  await shutdown(1);
}
