#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const LOG_PREFIX = "[check-docs-i18n]";
const docsRoot = process.env.DOCS_I18N_ROOT
  ? path.resolve(process.cwd(), process.env.DOCS_I18N_ROOT)
  : path.join(process.cwd(), "docs");
const supportedLocales = ["fr", "es", "de"];
const allowedStatuses = new Set(["draft", "needs-native-review", "verified"]);
const localeRoutePattern = /^(en|fr|es|de|x-default|[a-z]{2}(?:-[a-z]{2})?)$/i;
const sourceShaPattern = /^[a-f0-9]{7,40}$/i;

const toRelativePath = (absolutePath) =>
  path.relative(process.cwd(), absolutePath).replaceAll("\\", "/");

const canonicalRoute = (route) => {
  if (typeof route !== "string") {
    return null;
  }

  const normalized = route
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) {
    return null;
  }
  if (normalized === "/") {
    return "/";
  }
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
};

const routeFromMarkdownFile = (absolutePath) => {
  const relative = path.relative(docsRoot, absolutePath).replaceAll("\\", "/");
  if (!relative.endsWith(".md")) {
    return null;
  }

  const withoutExtension = relative.replace(/\.md$/i, "");
  if (withoutExtension === "index") {
    return "/";
  }

  if (withoutExtension.endsWith("/index")) {
    return `/${withoutExtension.replace(/\/index$/, "")}/`;
  }

  if (withoutExtension === "README") {
    return "/README";
  }

  if (withoutExtension.endsWith("/README")) {
    return `/${withoutExtension}`;
  }

  return `/${withoutExtension}`;
};

const walkMarkdownFiles = (rootDir) => {
  const files = [];

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b));
};

const extractFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
};

const stripQuotes = (value) => {
  const trimmed = String(value || "").trim();
  const quoteWrapped =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoteWrapped ? trimmed.slice(1, -1).trim() : trimmed;
};

const extractScalar = (frontmatter, key) => {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? stripQuotes(match[1]) : null;
};

const extractAlternateLocales = (frontmatter) => {
  const blockMatch = frontmatter.match(/^alternateLocales:\s*\r?\n((?: {2}.*\r?\n?)*)/m);
  if (!blockMatch) {
    return null;
  }

  const lines = blockMatch[1].split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return {};
  }

  const alternateLocales = {};
  for (const line of lines) {
    if (!line.startsWith("  ")) {
      break;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const pairMatch = trimmed.match(/^([A-Za-z0-9-]+):\s*(.+)$/);
    if (!pairMatch) {
      return null;
    }

    const locale = pairMatch[1].toLowerCase();
    const route = stripQuotes(pairMatch[2]);
    alternateLocales[locale] = route;
  }

  return alternateLocales;
};

const isValidDateString = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const getLocaleFromFilePath = (absolutePath) => {
  const relative = path.relative(docsRoot, absolutePath).replaceAll("\\", "/");
  const firstSegment = relative.split("/")[0];
  return supportedLocales.includes(firstSegment) ? firstSegment : null;
};

const run = () => {
  if (!fs.existsSync(docsRoot)) {
    console.error(`${LOG_PREFIX} docs directory not found at ${toRelativePath(docsRoot)}`);
    process.exit(1);
  }

  const allMarkdownFiles = walkMarkdownFiles(docsRoot);
  const allRoutes = new Set(
    allMarkdownFiles
      .map((absolutePath) => canonicalRoute(routeFromMarkdownFile(absolutePath)))
      .filter(Boolean),
  );

  const translatedFiles = allMarkdownFiles.filter((absolutePath) =>
    getLocaleFromFilePath(absolutePath),
  );

  if (!translatedFiles.length) {
    console.log(`${LOG_PREFIX} passed (no translated docs pages found).`);
    return;
  }

  const failures = [];
  const records = [];

  for (const absolutePath of translatedFiles) {
    const relativePath = toRelativePath(absolutePath);
    const locale = getLocaleFromFilePath(absolutePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const frontmatter = extractFrontmatter(source);

    if (!frontmatter) {
      failures.push(`${relativePath}: missing YAML frontmatter block`);
      continue;
    }

    const translationOf = extractScalar(frontmatter, "translationOf");
    const sourceSha = extractScalar(frontmatter, "sourceSha");
    const translationUpdated = extractScalar(frontmatter, "translationUpdated");
    const translationStatus = extractScalar(frontmatter, "translationStatus");
    const alternateLocales = extractAlternateLocales(frontmatter);

    if (!translationOf) {
      failures.push(`${relativePath}: missing required frontmatter key 'translationOf'`);
    } else {
      const sourcePath = path.join(process.cwd(), translationOf);
      if (!fs.existsSync(sourcePath)) {
        failures.push(
          `${relativePath}: translationOf points to missing source file '${translationOf}'`,
        );
      }
    }

    if (!sourceSha) {
      failures.push(`${relativePath}: missing required frontmatter key 'sourceSha'`);
    } else if (!sourceShaPattern.test(sourceSha)) {
      failures.push(`${relativePath}: sourceSha must be a git SHA-like hex string (7-40 chars)`);
    } else if (/^0+$/i.test(sourceSha)) {
      failures.push(`${relativePath}: sourceSha cannot be all zeros`);
    }

    if (!translationUpdated) {
      failures.push(`${relativePath}: missing required frontmatter key 'translationUpdated'`);
    } else if (!isValidDateString(translationUpdated)) {
      failures.push(`${relativePath}: translationUpdated must use YYYY-MM-DD format`);
    }

    if (!translationStatus) {
      failures.push(`${relativePath}: missing required frontmatter key 'translationStatus'`);
    } else if (!allowedStatuses.has(translationStatus)) {
      failures.push(
        `${relativePath}: translationStatus must be one of [${[...allowedStatuses].join(", ")}]`,
      );
    }

    if (
      !alternateLocales ||
      typeof alternateLocales !== "object" ||
      Array.isArray(alternateLocales)
    ) {
      failures.push(
        `${relativePath}: alternateLocales must be an object map in frontmatter (locale -> route)`,
      );
      continue;
    }

    const ownRoute = canonicalRoute(routeFromMarkdownFile(absolutePath));
    if (!ownRoute) {
      failures.push(`${relativePath}: unable to resolve route from file path`);
      continue;
    }

    const alternateCanonical = {};
    for (const [altLocale, altRouteRaw] of Object.entries(alternateLocales)) {
      if (!localeRoutePattern.test(altLocale)) {
        failures.push(`${relativePath}: alternate locale '${altLocale}' has invalid format`);
        continue;
      }

      const altRoute = canonicalRoute(altRouteRaw);
      if (!altRoute) {
        failures.push(`${relativePath}: alternate route for '${altLocale}' must start with '/'`);
        continue;
      }

      if (!allRoutes.has(altRoute)) {
        failures.push(
          `${relativePath}: alternate route for '${altLocale}' does not resolve to an existing docs page ('${altRouteRaw}')`,
        );
      }

      alternateCanonical[altLocale.toLowerCase()] = altRoute;
    }

    if (!alternateCanonical.en) {
      failures.push(`${relativePath}: alternateLocales must include canonical 'en' route`);
    }

    if (!alternateCanonical[locale]) {
      failures.push(`${relativePath}: alternateLocales must include locale '${locale}' route`);
    } else if (alternateCanonical[locale] !== ownRoute) {
      failures.push(
        `${relativePath}: alternateLocales.${locale} must match this page route ('${ownRoute}')`,
      );
    }

    records.push({ relativePath, locale, ownRoute, alternateLocales: alternateCanonical });
  }

  const recordsByRoute = new Map(records.map((record) => [record.ownRoute, record]));

  for (const record of records) {
    for (const [altLocale, altRoute] of Object.entries(record.alternateLocales)) {
      if (altLocale === "en" || altLocale === "x-default") {
        continue;
      }

      const reciprocalRecord = recordsByRoute.get(altRoute);
      if (!reciprocalRecord) {
        continue;
      }

      const reciprocalRoute = reciprocalRecord.alternateLocales[record.locale];
      if (!reciprocalRoute) {
        failures.push(
          `${record.relativePath}: reciprocal mapping missing in ${reciprocalRecord.relativePath} for locale '${record.locale}'`,
        );
        continue;
      }

      if (reciprocalRoute !== record.ownRoute) {
        failures.push(
          `${record.relativePath}: reciprocal mapping mismatch in ${reciprocalRecord.relativePath} for locale '${record.locale}'`,
        );
      }
    }
  }

  if (failures.length) {
    console.error(`${LOG_PREFIX} failures:`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(`${LOG_PREFIX} passed (${records.length} translated pages validated).`);
};

run();
