/**
 * Docker runtime-image smoke test.
 *
 * Builds each Node service's runtime image and runs its entrypoint to prove the
 * image actually contains every dependency the service imports. Guards against
 * the #141 class of defect: npm can nest a workspace dependency under
 * packages/<svc>/node_modules (instead of hoisting it to root) on a version
 * conflict, and a runtime stage that copies only root node_modules then crashes
 * with ERR_MODULE_NOT_FOUND on a fresh deploy.
 *
 * A service "passes" when its entrypoint loads its whole module graph — i.e. it
 * reaches runtime behavior (throws a config/env error, or starts listening)
 * rather than failing at module resolution. Static UI images have no Node
 * runtime and are out of scope.
 */

import { spawnSync } from "node:child_process";

const SERVICES = [
  { name: "api", entry: "packages/api/dist/index.js" },
  { name: "gateway", entry: "packages/gateway/dist/index.js" },
];

// Node's "module not found at link time" signatures. These are the failures a
// missing runtime dependency produces; anything else means the graph loaded.
const MODULE_ERROR = /ERR_MODULE_NOT_FOUND|Cannot find (package|module)/i;

const run = (args, opts = {}) => spawnSync("docker", args, { encoding: "utf8", ...opts });

let failed = false;

for (const svc of SERVICES) {
  const tag = `freeboard-${svc.name}:smoke`;
  const container = `fb-smoke-${svc.name}`;

  console.log(`\n=== building ${svc.name} runtime image ===`);
  const build = run(
    [
      "build",
      "-f",
      `packages/${svc.name}/Dockerfile`,
      "--target",
      "runtime",
      "--load",
      "-t",
      tag,
      ".",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (build.status !== 0) {
    console.error(`FAIL ${svc.name}: image build failed`);
    failed = true;
    continue;
  }

  console.log(`=== loading module graph for ${svc.name} ===`);
  run(["rm", "-f", container]); // best-effort pre-clean
  // Run the real entrypoint. Expected to throw a config/env error or start
  // listening (killed by the timeout) — both prove the module graph resolved.
  const res = run(["run", "--rm", "--name", container, tag, "node", svc.entry], {
    timeout: 25_000,
  });
  run(["rm", "-f", container]); // ensure removed if the timeout left it running

  const output = `${res.stdout || ""}${res.stderr || ""}`;
  if (MODULE_ERROR.test(output)) {
    console.error(`FAIL ${svc.name}: missing runtime dependency in image:\n${output}`);
    failed = true;
  } else {
    console.log(`PASS ${svc.name}: module graph loaded (no module-resolution error).`);
  }
}

process.exit(failed ? 1 : 0);
