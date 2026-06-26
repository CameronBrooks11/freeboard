/**
 * Guard: @freeboard/core stays a self-contained, framework-free,
 * Node/no-DOM package.
 *
 * DOM-freeness is enforced by the package's tsconfig (`lib: ["ES2022"]`, no
 * "DOM"): any use of a DOM global is a compile error, so this script does not
 * re-check it (and avoids false positives on names like `document` fields). It
 * covers what tsc cannot:
 *  1. no UI-framework import (vue / pinia / @vue/*);
 *  2. no relative import that escapes the package src tree (`../`);
 *  3. the barrel (index.ts) must not pull Ajv — it may only `export type` from
 *     "./validate", and must never import "ajv".
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "packages/core/src";

const walk = (dir) => {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.ts$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
};

const FRAMEWORK_IMPORT = /from\s+['"](vue|pinia|@vue\/[^'"]*)['"]/;
const PARENT_ESCAPE_IMPORT = /from\s+['"]\.\.\//;

const violations = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (FRAMEWORK_IMPORT.test(source)) {
    violations.push(
      `${file}: imports a UI framework (vue/pinia/@vue) — core must stay framework-free`,
    );
  }
  if (PARENT_ESCAPE_IMPORT.test(source)) {
    violations.push(
      `${file}: relative import escapes the package ("../") — core must be self-contained`,
    );
  }
}

// Barrel must not pull Ajv into eager consumers.
const indexPath = join(ROOT, "index.ts");
const indexSource = readFileSync(indexPath, "utf8");
for (const line of indexSource.split("\n")) {
  if (!/^\s*(import|export)\b/.test(line)) {
    continue; // skip comments / prose
  }
  if (/['"]\.\/validate/.test(line) && !/^\s*export\s+type\b/.test(line)) {
    violations.push(
      `index.ts: only \`export type ... from "./validate.js"\` is allowed (found: ${line.trim()})`,
    );
  }
}
if (/from\s+['"]ajv(\/[^'"]*)?['"]/.test(indexSource)) {
  violations.push(`index.ts: must not import 'ajv' — keep it behind the ./validate.js subpath`);
}

if (violations.length > 0) {
  console.error(
    `[check:core-headless] violations:\n${violations.map((v) => `  - ${v}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("[check:core-headless] passed (framework-free, self-contained, ajv-free barrel).");
