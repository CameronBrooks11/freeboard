import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const UI_SRC_ROOT = path.join(PROJECT_ROOT, "packages", "ui", "src");
const MODELS_ROOT = path.join(UI_SRC_ROOT, "models");
const DATASOURCES_ROOT = path.join(UI_SRC_ROOT, "datasources");

const SOURCE_FILE_PATTERN = /\.(js|mjs|cjs|ts|vue)$/;

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

const getLineNumbers = (content, matcher) => {
  const lines = content.split(/\r?\n/);
  const matches = [];

  lines.forEach((line, index) => {
    if (matcher.test(line)) {
      matches.push(index + 1);
    }
  });

  return matches;
};

const getRegexMatchLineNumbers = (content, regex) => {
  const matches = [];
  for (const match of content.matchAll(regex)) {
    const index = typeof match.index === "number" ? match.index : -1;
    if (index < 0) {
      continue;
    }
    const lineNumber = content.slice(0, index).split(/\r?\n/).length;
    matches.push(lineNumber);
  }
  return matches;
};

const relativePath = (absolutePath) => path.relative(PROJECT_ROOT, absolutePath);

const main = async () => {
  const uiSourceFiles = await walkFiles(UI_SRC_ROOT);
  const modelAndDatasourceFiles = [
    ...(await walkFiles(MODELS_ROOT)),
    ...(await walkFiles(DATASOURCES_ROOT)),
  ];

  const violations = [];

  for (const filePath of uiSourceFiles) {
    const content = await readFile(filePath, "utf8");
    const lineNumbers = getLineNumbers(content, /stores\/freeboard/);
    if (lineNumbers.length > 0) {
      violations.push({
        type: "deprecated_store_import",
        filePath,
        lineNumbers,
        message: "deprecated store reference `stores/freeboard`",
      });
    }
  }

  for (const filePath of modelAndDatasourceFiles) {
    const content = await readFile(filePath, "utf8");
    const lineNumbers = getRegexMatchLineNumbers(
      content,
      /(?:^|\n)\s*import[^;]*from\s+["'][^"']*stores\/[^"']+["'][^;]*;?/g,
    );

    if (lineNumbers.length > 0) {
      violations.push({
        type: "forbidden_store_import",
        filePath,
        lineNumbers,
        message: "models/datasources must not import stores",
      });
    }
  }

  if (violations.length > 0) {
    console.error("UI store boundary check failed:\n");
    violations.forEach((violation) => {
      console.error(
        `- ${relativePath(violation.filePath)}:${violation.lineNumbers.join(
          ",",
        )} -> ${violation.message}`,
      );
    });
    process.exit(1);
  }

  console.log("UI store boundary check passed.");
};

main().catch((error) => {
  console.error("Failed to run UI store boundary check:", error);
  process.exit(1);
});
