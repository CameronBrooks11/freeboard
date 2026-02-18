#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const distRoot = path.join(cwd, "packages", "ui", "dist");
const assetsRoot = path.join(distRoot, "assets");

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

const listAssetFiles = () => {
  if (!fs.existsSync(assetsRoot)) {
    throw new Error(`UI dist assets path not found: ${assetsRoot}`);
  }

  return fs
    .readdirSync(assetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = path.join(assetsRoot, entry.name);
      const stat = fs.statSync(absolutePath);
      return {
        name: entry.name,
        bytes: stat.size,
      };
    });
};

const files = listAssetFiles();
const jsFiles = files.filter((file) => file.name.endsWith(".js"));
const cssFiles = files.filter((file) => file.name.endsWith(".css"));

const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const totalJsBytes = jsFiles.reduce((sum, file) => sum + file.bytes, 0);
const totalCssBytes = cssFiles.reduce((sum, file) => sum + file.bytes, 0);

const topFiles = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
const topJsFiles = [...jsFiles].sort((a, b) => b.bytes - a.bytes).slice(0, 10);

const lines = [];
lines.push("UI Build Metrics");
lines.push("================");
lines.push("");
lines.push(`Assets path: ${assetsRoot}`);
lines.push(`Total assets: ${files.length}`);
lines.push(`Total size: ${formatKiB(totalBytes)}`);
lines.push(`Total JS size: ${formatKiB(totalJsBytes)} (${jsFiles.length} files)`);
lines.push(`Total CSS size: ${formatKiB(totalCssBytes)} (${cssFiles.length} files)`);
lines.push("");
lines.push("Top 10 largest assets:");
for (const file of topFiles) {
  lines.push(`- ${file.name}: ${formatKiB(file.bytes)}`);
}
lines.push("");
lines.push("Top 10 largest JS assets:");
for (const file of topJsFiles) {
  lines.push(`- ${file.name}: ${formatKiB(file.bytes)}`);
}

const report = lines.join("\n");
console.log(report);
