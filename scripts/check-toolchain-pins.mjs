/**
 * @module scripts/check-toolchain-pins
 * Fail when the Node/npm pins disagree with each other or with the running toolchain.
 *
 * `.nvmrc` is the Node pin and `packageManager` the npm pin. The Docker build
 * defaults and the image-publish workflow must name the same versions, and the
 * Node that CI installs from `.nvmrc` must run exactly the pinned npm. Run it
 * under the pinned Node (as CI does); on another Node the runtime half fails by
 * design.
 */

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DOCKERFILES = [
  "packages/api/Dockerfile",
  "packages/gateway/Dockerfile",
  "packages/ui/Dockerfile",
];
const PUBLISH_WORKFLOW = ".github/workflows/build-docker-images.yml";

const read = (relativePath) => readFile(path.join(PROJECT_ROOT, relativePath), "utf8");

const match = (text, pattern, where) => {
  const found = text.match(pattern);
  if (!found) {
    throw new Error(`${where}: expected a line matching ${pattern}`);
  }
  return found[1];
};

const main = async () => {
  const nodePin = (await read(".nvmrc")).trim();
  const packageJson = JSON.parse(await read("package.json"));
  const npmPin = match(packageJson.packageManager || "", /^npm@(\d+\.\d+\.\d+)$/, "packageManager");

  const problems = [];
  const expect = (where, actual, expected) => {
    if (actual !== expected) {
      problems.push(`${where}: ${actual} (expected ${expected})`);
    }
  };

  for (const dockerfile of DOCKERFILES) {
    const text = await read(dockerfile);
    expect(
      `${dockerfile} NODE_IMAGE`,
      match(text, /^ARG NODE_IMAGE=node:(\S+?)-alpine\S*$/m, dockerfile),
      nodePin,
    );
    expect(
      `${dockerfile} NPM_VERSION`,
      match(text, /^ARG NPM_VERSION=(\S+)$/m, dockerfile),
      npmPin,
    );
  }

  const workflow = await read(PUBLISH_WORKFLOW);
  expect(
    `${PUBLISH_WORKFLOW} MAINLINE_NODE_IMAGE`,
    match(workflow, /^\s+MAINLINE_NODE_IMAGE: node:(\S+?)-alpine\S*$/m, PUBLISH_WORKFLOW),
    nodePin,
  );
  expect(
    `${PUBLISH_WORKFLOW} NPM_VERSION`,
    match(workflow, /^\s+NPM_VERSION: (\S+)$/m, PUBLISH_WORKFLOW),
    npmPin,
  );

  expect("running node", process.versions.node, nodePin);
  const runningNpm = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
  expect("running npm", runningNpm, npmPin);

  if (problems.length > 0) {
    console.error(
      `Toolchain pin check failed (.nvmrc node ${nodePin}, packageManager npm ${npmPin}):\n`,
    );
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exit(1);
  }

  console.log(`Toolchain pin check passed (node ${nodePin}, npm ${npmPin}).`);
};

main().catch((error) => {
  console.error("Failed to run toolchain pin check:", error);
  process.exit(1);
});
