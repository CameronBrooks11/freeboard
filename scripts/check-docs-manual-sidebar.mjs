#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const LOG_PREFIX = "[check-docs-manual-sidebar]";
const docsRoot = path.join(process.cwd(), "docs");
const manualRoot = path.join(docsRoot, "manual");
const vitepressConfigPath = path.join(docsRoot, ".vitepress", "config.mjs");
const manualSidebarRoot = "/manual/";

// Keep this empty unless there are manual routes that intentionally do not map to docs/manual sources.
const routeResolutionAllowlist = new Set();

const normalizeManualRoute = (route) => {
  if (typeof route !== "string" || !route.startsWith(manualSidebarRoot)) {
    return null;
  }
  const [pathOnly] = route.split(/[?#]/);
  return pathOnly || null;
};

const toRelativePath = (absolutePath) =>
  path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");

const manualRouteCandidates = (route) => {
  const relative = route.replace(/^\//, "");
  if (relative.endsWith("/")) {
    return [path.join(docsRoot, relative, "index.md"), path.join(docsRoot, relative, "README.md")];
  }
  return [
    path.join(docsRoot, `${relative}.md`),
    path.join(docsRoot, relative, "index.md"),
    path.join(docsRoot, relative, "README.md"),
  ];
};

const collectSidebarLinks = (items, links = new Set()) => {
  if (!Array.isArray(items)) {
    return links;
  }
  for (const item of items) {
    if (item && typeof item === "object") {
      const normalized = normalizeManualRoute(item.link);
      if (normalized) {
        links.add(normalized);
      }
      if (Array.isArray(item.items)) {
        collectSidebarLinks(item.items, links);
      }
    }
  }
  return links;
};

const expectedManualRoutes = () => {
  if (!fs.existsSync(manualRoot)) {
    throw new Error(`manual docs directory not found at ${toRelativePath(manualRoot)}`);
  }

  return fs
    .readdirSync(manualRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .filter((name) => name !== "README.md" && name !== "index.md")
    .map((name) => `/manual/${name.replace(/\.md$/i, "")}`)
    .sort((a, b) => a.localeCompare(b));
};

const readConfig = async () => {
  if (!fs.existsSync(vitepressConfigPath)) {
    throw new Error(`VitePress config not found at ${toRelativePath(vitepressConfigPath)}`);
  }

  const imported = await import(pathToFileURL(vitepressConfigPath).href);
  const config = imported.default ?? imported;
  const manualSidebar = config?.themeConfig?.sidebar?.[manualSidebarRoot];
  if (!Array.isArray(manualSidebar)) {
    throw new Error(
      `Missing manual sidebar configuration at themeConfig.sidebar["${manualSidebarRoot}"]`,
    );
  }
  return manualSidebar;
};

const run = async () => {
  const manualSidebar = await readConfig();
  const sidebarLinks = [...collectSidebarLinks(manualSidebar)].sort((a, b) => a.localeCompare(b));
  const sidebarLinkSet = new Set(sidebarLinks);
  const expectedRoutes = expectedManualRoutes();

  const missingTargetLinks = [];
  for (const route of sidebarLinks) {
    if (routeResolutionAllowlist.has(route)) {
      continue;
    }
    const candidates = manualRouteCandidates(route);
    const resolved = candidates.some((candidate) => fs.existsSync(candidate));
    if (!resolved) {
      missingTargetLinks.push({
        route,
        candidates: candidates.map((candidate) => toRelativePath(candidate)),
      });
    }
  }

  const missingFromSidebar = expectedRoutes.filter((route) => !sidebarLinkSet.has(route));

  if (!sidebarLinks.length) {
    console.error(`${LOG_PREFIX} failures:`);
    console.error("  - no /manual/ links found in VitePress sidebar");
    process.exit(1);
  }

  if (missingTargetLinks.length || missingFromSidebar.length) {
    console.error(`${LOG_PREFIX} failures:`);
    for (const item of missingTargetLinks) {
      console.error(`  - sidebar link '${item.route}' does not resolve to a docs source file`);
      for (const candidate of item.candidates) {
        console.error(`    expected one of: ${candidate}`);
      }
    }
    for (const route of missingFromSidebar) {
      console.error(`  - manual page route missing from sidebar: '${route}'`);
    }
    process.exit(1);
  }

  console.log(
    `${LOG_PREFIX} passed (${sidebarLinks.length} sidebar links checked, ${expectedRoutes.length} manual pages covered).`,
  );
};

run().catch((error) => {
  console.error(`${LOG_PREFIX} failure: ${error.message}`);
  process.exit(1);
});
