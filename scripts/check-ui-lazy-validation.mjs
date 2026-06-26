/**
 * Guard: the dashboard validator (Ajv-backed) must be reached only via a dynamic
 * `import()` so Ajv stays in a lazy chunk off the eager player path. A static
 * value import of it anywhere under packages/ui/src would pull ~130 KiB of Ajv
 * into the entry bundle — and the bundle-budget gate is warn-only on the entry,
 * so it would not catch the regression. `import type { ... }` is allowed (it is
 * erased at build).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "packages/ui/src";
const TARGET = "dashboardValidation";

// `import ... from "...dashboardValidation..."` that is NOT `import type`.
const STATIC_VALUE_IMPORT = new RegExp(
  String.raw`^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*${TARGET}[^'"]*['"]`,
  "m",
);
// Side-effect import: `import "...dashboardValidation..."`.
const SIDE_EFFECT_IMPORT = new RegExp(String.raw`^\s*import\s+['"][^'"]*${TARGET}[^'"]*['"]`, "m");

const walk = (dir) => {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|vue)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
};

const violations = walk(ROOT).filter((file) => {
  const source = readFileSync(file, "utf8");
  if (!source.includes(TARGET)) {
    return false;
  }
  return STATIC_VALUE_IMPORT.test(source) || SIDE_EFFECT_IMPORT.test(source);
});

if (violations.length > 0) {
  console.error(
    `[check:ui:lazy-validation] '${TARGET}' must be reached only via dynamic import() ` +
      `(or 'import type'), so Ajv stays in a lazy chunk off the player path.\n` +
      `Static value import found in:\n${violations.map((f) => `  - ${f}`).join("\n")}`,
  );
  process.exit(1);
}

console.log(`[check:ui:lazy-validation] passed (${TARGET} is dynamic-import-only).`);
