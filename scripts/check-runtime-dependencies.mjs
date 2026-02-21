/**
 * @module scripts/check-runtime-dependencies
 * Fail when known dev-only tooling appears in runtime dependency blocks.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();

const RUNTIME_PACKAGES = ["packages/api/package.json", "packages/gateway/package.json"];

const DEV_ONLY_RUNTIME_DEPENDENCIES = new Set(["concurrently", "nodemon"]);

const main = async () => {
  const violations = [];

  for (const relativePath of RUNTIME_PACKAGES) {
    const absolutePath = path.join(PROJECT_ROOT, relativePath);
    const content = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(content);
    const dependencies = parsed.dependencies || {};

    for (const dependencyName of Object.keys(dependencies)) {
      if (!DEV_ONLY_RUNTIME_DEPENDENCIES.has(dependencyName)) {
        continue;
      }
      violations.push({
        packageName: parsed.name || relativePath,
        relativePath,
        dependencyName,
      });
    }
  }

  if (violations.length > 0) {
    console.error(
      "Runtime dependency hygiene check failed. Dev-only tooling found in dependencies:\n",
    );
    for (const violation of violations) {
      console.error(
        `- ${violation.relativePath} (${violation.packageName}): ${violation.dependencyName}`,
      );
    }
    process.exit(1);
  }

  console.log("Runtime dependency hygiene check passed.");
};

main().catch((error) => {
  console.error("Failed to run runtime dependency hygiene check:", error);
  process.exit(1);
});
