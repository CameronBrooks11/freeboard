import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const dockerCommand = isWindows ? "docker.exe" : "docker";
const composeArgs = ["compose", "-f", "docker-compose.realtime-demo.yml"];

const run = (command, args, { stdio = "inherit" } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 0);
    });
  });

const runOrThrow = async (command, args, label) => {
  const code = await run(command, args);
  if (code !== 0) {
    throw new Error(`${label} failed with exit code ${code}`);
  }
};

const main = async () => {
  try {
    await runOrThrow(
      dockerCommand,
      [...composeArgs, "up", "-d", "--build", "--wait", "--wait-timeout", "180"],
      "Realtime fixture startup"
    );

    await runOrThrow("node", ["scripts/realtime-demo-smoke.mjs"], "Realtime smoke checks");
  } finally {
    await run(dockerCommand, [...composeArgs, "down", "--timeout", "10"]);
  }
};

await main();
