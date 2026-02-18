#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const distAssetsPath = path.join(process.cwd(), "packages", "ui", "dist", "assets");
const budgetConfigPath = path.join(process.cwd(), "packages", "ui", "build-budget.json");

if (!fs.existsSync(distAssetsPath)) {
  console.error(`UI dist assets path not found: ${distAssetsPath}`);
  process.exit(1);
}

const files = fs
  .readdirSync(distAssetsPath, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const filePath = path.join(distAssetsPath, entry.name);
    return {
      name: entry.name,
      bytes: fs.statSync(filePath).size,
    };
  });

const jsFiles = files.filter((file) => file.name.endsWith(".js"));
const jsTotalBytes = jsFiles.reduce((sum, file) => sum + file.bytes, 0);

// Optional editor payloads (Monaco + workers) are tracked separately from core route budgets.
const isEditorPayload = (name) =>
  [
    "monaco-",
    "editor-monaco-",
    "CodeEditorFormElement-",
    "editor.worker-",
    "json.worker-",
    "css.worker-",
    "html.worker-",
    "ts.worker-",
  ].some((token) => name.includes(token));

const editorJsFiles = jsFiles.filter((file) => isEditorPayload(file.name));
const coreJsFiles = jsFiles.filter((file) => !isEditorPayload(file.name));

const editorJsTotalBytes = editorJsFiles.reduce((sum, file) => sum + file.bytes, 0);
const coreJsTotalBytes = coreJsFiles.reduce((sum, file) => sum + file.bytes, 0);

const largestJs = [...jsFiles].sort((a, b) => b.bytes - a.bytes)[0];
const largestCoreJs = [...coreJsFiles].sort((a, b) => b.bytes - a.bytes)[0];
const largestEditorJs = [...editorJsFiles].sort((a, b) => b.bytes - a.bytes)[0];
const entryJs =
  jsFiles.find((file) => /^(index|main)-.+\.js$/.test(file.name)) ??
  jsFiles.find((file) => file.name.includes("index-")) ??
  null;

const toKiB = (bytes) => bytes / 1024;
const fmt = (bytes) => `${toKiB(bytes).toFixed(1)} KiB`;

const readBudgets = () => {
  if (!fs.existsSync(budgetConfigPath)) {
    return {
      entryWarnKiB: 450,
      largestCoreWarnKiB: 1200,
      coreTotalWarnKiB: 3000,
      editorTotalWarnKiB: 14500,
    };
  }
  const raw = fs.readFileSync(budgetConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    entryWarnKiB: Number(parsed.entryWarnKiB || 450),
    largestCoreWarnKiB: Number(parsed.largestCoreWarnKiB || 1200),
    coreTotalWarnKiB: Number(parsed.coreTotalWarnKiB || 3000),
    editorTotalWarnKiB: Number(parsed.editorTotalWarnKiB || 14500),
  };
};

const budgets = readBudgets();
const limits = {
  entryWarnBytes: budgets.entryWarnKiB * 1024,
  largestCoreWarnBytes: budgets.largestCoreWarnKiB * 1024,
  coreTotalWarnBytes: budgets.coreTotalWarnKiB * 1024,
  editorTotalWarnBytes: budgets.editorTotalWarnKiB * 1024,
};

const coreWarnings = [];
const editorWarnings = [];
if (!entryJs) {
  coreWarnings.push("Could not detect entry JS chunk (index/main).");
} else if (entryJs.bytes > limits.entryWarnBytes) {
  coreWarnings.push(
    `Entry chunk ${entryJs.name} is ${fmt(entryJs.bytes)} (warn limit ${fmt(limits.entryWarnBytes)}).`,
  );
}

if (largestCoreJs && largestCoreJs.bytes > limits.largestCoreWarnBytes) {
  coreWarnings.push(
    `Largest core JS chunk ${largestCoreJs.name} is ${fmt(largestCoreJs.bytes)} (warn limit ${fmt(limits.largestCoreWarnBytes)}).`,
  );
}

if (coreJsTotalBytes > limits.coreTotalWarnBytes) {
  coreWarnings.push(
    `Total core JS output is ${fmt(coreJsTotalBytes)} (warn limit ${fmt(limits.coreTotalWarnBytes)}).`,
  );
}

if (editorJsTotalBytes > limits.editorTotalWarnBytes) {
  editorWarnings.push(
    `Total optional editor JS output is ${fmt(editorJsTotalBytes)} (warn limit ${fmt(limits.editorTotalWarnBytes)}).`,
  );
}

console.log("UI bundle budget check");
console.log("======================");
console.log(`Budget config: ${budgetConfigPath}`);
if (entryJs) {
  console.log(`Entry JS: ${entryJs.name} (${fmt(entryJs.bytes)})`);
}
if (largestJs) {
  console.log(`Largest JS: ${largestJs.name} (${fmt(largestJs.bytes)})`);
}
console.log(`Total JS: ${fmt(jsTotalBytes)} (${jsFiles.length} files)`);
console.log(`Core JS: ${fmt(coreJsTotalBytes)} (${coreJsFiles.length} files)`);
console.log(`Optional editor JS: ${fmt(editorJsTotalBytes)} (${editorJsFiles.length} files)`);
if (largestCoreJs) {
  console.log(`Largest core JS: ${largestCoreJs.name} (${fmt(largestCoreJs.bytes)})`);
}
if (largestEditorJs) {
  console.log(
    `Largest optional editor JS: ${largestEditorJs.name} (${fmt(largestEditorJs.bytes)})`,
  );
}

if (!coreWarnings.length && !editorWarnings.length) {
  console.log("No bundle budget warnings.");
  process.exit(0);
}

if (coreWarnings.length) {
  console.warn("\nCore bundle warnings:");
  for (const warning of coreWarnings) {
    console.warn(`- ${warning}`);
  }
}

if (editorWarnings.length) {
  console.warn("\nOptional editor bundle warnings:");
  for (const warning of editorWarnings) {
    console.warn(`- ${warning}`);
  }
}

const enforce = ["1", "true", "yes", "on"].includes(
  String(process.env.FREEBOARD_ENFORCE_UI_BUNDLE_BUDGET || "")
    .trim()
    .toLowerCase(),
);

// Enforced mode fails only on core-route regressions; optional editor payload remains warn-only.
if (enforce && coreWarnings.length) {
  process.exit(1);
}
