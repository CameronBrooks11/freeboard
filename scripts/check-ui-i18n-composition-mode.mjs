import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const i18nBootstrapPath = path.resolve(__dirname, "../packages/ui/src/i18n/index.ts");

const source = fs.readFileSync(i18nBootstrapPath, "utf8");
const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const createI18nMatch = sourceWithoutComments.match(/createI18n\s*\(\s*\{([\s\S]*?)\}\s*\)/);
const failures = [];

if (!createI18nMatch) {
  failures.push("unable to locate `createI18n({ ... })` options in UI i18n bootstrap");
}

const optionsBlock = createI18nMatch?.[1] ?? "";

if (!/\blegacy\s*:\s*false\b/.test(optionsBlock)) {
  failures.push("missing required setting `legacy: false` in UI i18n bootstrap");
}

if (!/\bglobalInjection\s*:\s*true\b/.test(optionsBlock)) {
  failures.push("missing required setting `globalInjection: true` in UI i18n bootstrap");
}

if (/\blegacy\s*:\s*true\b/.test(optionsBlock)) {
  failures.push("unexpected legacy mode enablement (`legacy: true`) in UI i18n bootstrap");
}

if (failures.length) {
  console.error("[check-ui-i18n-composition-mode] failures:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("[check-ui-i18n-composition-mode] passed.");
