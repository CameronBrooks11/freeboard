import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOTS = [
  path.join(PROJECT_ROOT, "packages", "ui", "src"),
  path.join(PROJECT_ROOT, "packages", "api", "src"),
  path.join(PROJECT_ROOT, "packages", "gateway", "src"),
];

const SOURCE_FILE_PATTERN = /\.(ts|vue)$/;

const DEBT_PATTERNS = [
  { label: "as-any-cast", regex: /\bas\s+any\b/g },
  { label: "explicit-any-type", regex: /:\s*any\b/g },
  { label: "record-string-any", regex: /Record<string,\s*any>/g },
  { label: "index-signature-any", regex: /\[key:\s*string\]:\s*any/g },
  { label: "proptype-any", regex: /PropType<any>/g },
];

const walkFiles = async (rootDir) => {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }

    if (SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
};

const getLineNumberFromIndex = (content, index) => content.slice(0, index).split(/\r?\n/).length;

const main = async () => {
  const files = (await Promise.all(SOURCE_ROOTS.map(async (rootDir) => walkFiles(rootDir)))).flat();

  const violations = [];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");

    for (const pattern of DEBT_PATTERNS) {
      for (const match of content.matchAll(pattern.regex)) {
        if (typeof match.index !== "number") {
          continue;
        }
        violations.push({
          filePath: path.relative(PROJECT_ROOT, filePath),
          line: getLineNumberFromIndex(content, match.index),
          label: pattern.label,
          value: match[0],
        });
      }
    }
  }

  if (violations.length > 0) {
    console.error("TypeScript debt check failed. Unsafe patterns remain in source:\n");
    for (const violation of violations) {
      console.error(
        `- ${violation.filePath}:${violation.line} [${violation.label}] ${violation.value}`,
      );
    }
    process.exit(1);
  }

  console.log("TypeScript debt check passed.");
};

main().catch((error) => {
  console.error("Failed to run TypeScript debt check:", error);
  process.exit(1);
});
