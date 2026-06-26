/**
 * Guard: the Ajv-backed dashboard validator must be reached only via a dynamic
 * `import()` so Ajv stays in a lazy chunk off the eager player path. The
 * validator lives in `@freeboard/core/validate.js`; a static value
 * import of that subpath (or a direct `ajv` import) anywhere under
 * packages/ui/src would pull ~130 KiB of Ajv into the entry bundle — and the
 * bundle-budget gate is warn-only on the entry, so it would not catch the
 * regression. `import type { ... }` is allowed (it is erased at build).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "packages/ui/src";
const TARGET = "@freeboard/core/validate";

// `import ... from "...@freeboard/core/validate..."` that is NOT `import type`.
const STATIC_VALUE_IMPORT = new RegExp(
  String.raw`^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*${TARGET}[^'"]*['"]`,
  "m",
);
// Side-effect import of the validate subpath.
const SIDE_EFFECT_IMPORT = new RegExp(String.raw`^\s*import\s+['"][^'"]*${TARGET}[^'"]*['"]`, "m");
// Any static import from "ajv" / "ajv/...": the UI must not depend on Ajv directly.
const AJV_IMPORT = /^\s*import\s+[^;]*?from\s+['"]ajv(\/[^'"]*)?['"]/m;

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

const violations = [];
for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (
    source.includes(TARGET) &&
    (STATIC_VALUE_IMPORT.test(source) || SIDE_EFFECT_IMPORT.test(source))
  ) {
    violations.push(
      `${file}: static import of '${TARGET}' (use dynamic import() or 'import type')`,
    );
  }
  if (AJV_IMPORT.test(source)) {
    violations.push(`${file}: direct 'ajv' import (Ajv must stay behind the lazy core validator)`);
  }
}

if (violations.length > 0) {
  console.error(
    `[check:ui:lazy-validation] Ajv must stay in a lazy chunk off the player path.\n${violations
      .map((v) => `  - ${v}`)
      .join("\n")}`,
  );
  process.exit(1);
}

console.log("[check:ui:lazy-validation] passed (validator is dynamic-import-only; no direct ajv).");
