import { readdir } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOTS = [
  path.join(PROJECT_ROOT, "packages", "ui", "src"),
  path.join(PROJECT_ROOT, "packages", "api", "src"),
  path.join(PROJECT_ROOT, "packages", "gateway", "src"),
];

const LEGACY_JS_SOURCE_PATTERN = /\.(js|mjs|cjs)$/i;

const walkFiles = async (rootDir) => {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }
    files.push(absolutePath);
  }

  return files;
};

const main = async () => {
  const files = (await Promise.all(SOURCE_ROOTS.map((rootDir) => walkFiles(rootDir)))).flat();

  const legacyJsSourceFiles = files
    .filter((filePath) => LEGACY_JS_SOURCE_PATTERN.test(filePath))
    .map((filePath) => path.relative(PROJECT_ROOT, filePath))
    .sort();

  if (legacyJsSourceFiles.length > 0) {
    console.error("TS migration artifact check failed. Legacy JS source files remain:\n");
    for (const filePath of legacyJsSourceFiles) {
      console.error(`- ${filePath}`);
    }
    process.exit(1);
  }

  console.log("TS migration artifact check passed.");
};

main().catch((error) => {
  console.error("Failed to run TS migration artifact check:", error);
  process.exit(1);
});
