import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const dockerCommand = isWindows ? "docker.exe" : "docker";
const composeArgs = ["compose", "-f", "docker-compose.mongo.yml"];
const npmExecPath = process.env.npm_execpath;
const npmNodeExecPath = process.env.npm_node_execpath || process.execPath;

let servicesProcess = null;
let isShuttingDown = false;

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

const run = (command, args, { stdio = "inherit" } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio });

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
  console.log("Mongo container is left running for faster iteration.");
  console.log("Use `npm run dev:mongo:logs` to inspect Mongo logs.");
  console.log("Use `npm run dev:mongo:down` when done.");
  process.exit(exitCode);
};

process.on("SIGINT", () => {
  void shutdown(130);
});

process.on("SIGTERM", () => {
  void shutdown(143);
});

const main = async () => {
  console.log("Starting Mongo container...");
  const mongoUpCode = await run(dockerCommand, [
    ...composeArgs,
    "up",
    "-d",
    "--build",
    "--wait",
    "--wait-timeout",
    "180",
  ]);

  if (mongoUpCode !== 0) {
    console.error("");
    console.error("Mongo startup failed. Recent Mongo logs:");
    await run(dockerCommand, [...composeArgs, "logs", "--tail", "200", "mongo"]);
    process.exit(mongoUpCode);
  }

  console.log("");
  console.log("Development services:");
  console.log("- UI:    http://localhost:5173/");
  console.log("- API:   http://127.0.0.1:4001/graphql");
  console.log("- Proxy: http://127.0.0.1:8001/");
  console.log("- Mongo: mongodb://freeboard:unsecure@127.0.0.1:27017/freeboard");
  console.log("");

  const npmRunDevServices = getNpmRunCommand("dev:services");
  servicesProcess = spawn(npmRunDevServices.command, npmRunDevServices.args, {
    stdio: "inherit",
    detached: !isWindows,
  });

  servicesProcess.on("error", async (error) => {
    console.error("Failed to start development services", error);
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

await main();
