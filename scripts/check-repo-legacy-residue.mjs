#!/usr/bin/env node

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const LOG_PREFIX = "[check:repo:legacy-residue]";
const projectRoot = process.cwd();
const blockedPattern = /\b(mongo|mongodb|mongoose)\b/i;

// Keep the legacy datastore archive and this guard script allowlisted.
const allowlistedFiles = new Set([
  "docs/manual/legacy-datastore-architecture.md",
  "scripts/check-repo-legacy-residue.mjs",
]);

const listTrackedFiles = () => {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const main = () => {
  const failures = [];
  const trackedFiles = listTrackedFiles();

  for (const relativePath of trackedFiles) {
    if (allowlistedFiles.has(relativePath)) {
      continue;
    }

    const absolutePath = path.join(projectRoot, relativePath);
    let buffer;
    try {
      buffer = fs.readFileSync(absolutePath);
    } catch {
      continue;
    }
    // Skip binary files.
    if (buffer.includes(0)) {
      continue;
    }

    const content = buffer.toString("utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] || "";
      if (!blockedPattern.test(line)) {
        continue;
      }
      failures.push({
        path: relativePath,
        line: index + 1,
        text: line.trim(),
      });
    }
  }

  if (failures.length > 0) {
    console.error(`${LOG_PREFIX} failed.`);
    console.error(
      `${LOG_PREFIX} disallowed legacy datastore terms found outside allowlisted files:`,
    );
    for (const failure of failures) {
      const snippet = failure.text.slice(0, 180);
      console.error(`${LOG_PREFIX} ${failure.path}:${failure.line} ${snippet}`);
    }
    process.exit(1);
  }

  console.log(
    `${LOG_PREFIX} passed (checked ${trackedFiles.length} tracked files; allowlist=${allowlistedFiles.size}).`,
  );
};

try {
  main();
} catch (error) {
  console.error(`${LOG_PREFIX} failed.`);
  console.error(error?.message || error);
  process.exit(1);
}
