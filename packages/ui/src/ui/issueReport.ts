/**
 * @module ui/issueReport
 * @description Utilities for safe bug-report deep links and debug context generation.
 */

import { runtimeConfig } from "../runtime/config.js";
import { normalizeDashboardTheme } from "../models/Dashboard.js";

export const BUG_REPORT_ISSUE_TEMPLATE = "bug-report.yml";
export const DEFAULT_BUG_REPORT_NEW_ISSUE_URL =
  "https://github.com/CameronBrooks11/freeboard/issues/new";

const MAX_FIELD_LENGTH = 1200;

const filterControlCharacters = ({
  input,
  replacement,
  preserveTabAndNewline,
}: {
  input: string;
  replacement: string;
  preserveTabAndNewline: boolean;
}): string => {
  let output = "";
  for (const character of input) {
    const code = character.charCodeAt(0);
    const isControlCharacter = code <= 0x1f || code === 0x7f;
    const isPreservedWhitespace =
      preserveTabAndNewline && (character === "\n" || character === "\r" || character === "\t");

    if (!isControlCharacter || isPreservedWhitespace) {
      output += character;
      continue;
    }

    output += replacement;
  }
  return output;
};

const sanitizeSingleLine = (value: unknown, maxLength = MAX_FIELD_LENGTH): string =>
  filterControlCharacters({
    input: String(value || ""),
    replacement: " ",
    preserveTabAndNewline: false,
  })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeMultiline = (value: unknown, maxLength = MAX_FIELD_LENGTH): string =>
  filterControlCharacters({
    input: String(value || ""),
    replacement: "",
    preserveTabAndNewline: true,
  })
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .slice(0, maxLength);

const resolveSafeRoutePath = (pathnameValue: unknown): string => {
  const pathname = String(pathnameValue || "").trim();
  if (!pathname) {
    return "/";
  }

  if (/^\/s\/[^/]+/i.test(pathname)) {
    return "/s/:shareToken";
  }
  if (/^\/invite\/[^/]+/i.test(pathname)) {
    return "/invite/:token";
  }
  if (/^\/reset-password\/[^/]+/i.test(pathname)) {
    return "/reset-password/:token";
  }
  if (/^\/p\/[^/]+/i.test(pathname)) {
    return "/p/:id";
  }
  if (/^\/admin\/?$/i.test(pathname)) {
    return "/admin";
  }
  if (/^\/login\/?$/i.test(pathname)) {
    return "/login";
  }
  if (/^\/[^/]+\/?$/i.test(pathname)) {
    return "/:dashboardId";
  }

  return pathname;
};

const readViewportClass = (widthValue: unknown): "sm" | "md" | "lg" =>
  Number(widthValue) <= 640 ? "sm" : Number(widthValue) <= 1024 ? "md" : "lg";

const readQueryKeys = (searchValue: unknown): string => {
  const search = String(searchValue || "");
  if (!search) {
    return "none";
  }

  const keys = [...new URLSearchParams(search).keys()]
    .map((entry) => sanitizeSingleLine(entry, 64))
    .filter(Boolean);
  return keys.length ? keys.join(",") : "none";
};

export type BugReportContext = {
  version: string;
  runtimeMode: "static" | "server";
  route: string;
  queryKeys: string;
  themeSelection: string;
  themeResolved: string;
  viewport: string;
  browser: string;
  platform: string;
  locale: string;
};

export const collectBugReportContext = (): BugReportContext => {
  const documentElement =
    typeof document !== "undefined" && document.documentElement ? document.documentElement : null;

  const locationState = typeof window !== "undefined" ? window.location : null;
  const navigatorState = typeof navigator !== "undefined" ? navigator : null;

  const route = resolveSafeRoutePath(locationState?.pathname || "/");
  const queryKeys = readQueryKeys(locationState?.search || "");
  const selection = normalizeDashboardTheme(
    documentElement?.getAttribute("data-theme-selection") || "auto",
  );
  const resolvedTheme = normalizeDashboardTheme(documentElement?.getAttribute("data-theme") || "");
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;

  return {
    version: sanitizeSingleLine(runtimeConfig.version || "0.0.0-dev", 80),
    runtimeMode: runtimeConfig.isStaticBuild ? "static" : "server",
    route: sanitizeSingleLine(route, 120),
    queryKeys: sanitizeSingleLine(queryKeys, 200),
    themeSelection: sanitizeSingleLine(selection, 60),
    themeResolved: sanitizeSingleLine(resolvedTheme, 60),
    viewport: `${readViewportClass(viewportWidth)} (${Math.max(0, Number(viewportWidth) || 0)}px)`,
    browser: sanitizeSingleLine(navigatorState?.userAgent || "unknown", 240),
    platform: sanitizeSingleLine(navigatorState?.platform || "unknown", 120),
    locale: sanitizeSingleLine(navigatorState?.language || "unknown", 60),
  };
};

export const buildBugReportEnvironmentText = (context: BugReportContext): string =>
  [
    `Runtime mode: ${context.runtimeMode}`,
    `Route: ${context.route}`,
    `Query keys: ${context.queryKeys}`,
    `Theme selection: ${context.themeSelection}`,
    `Theme resolved: ${context.themeResolved}`,
    `Viewport: ${context.viewport}`,
    `Browser: ${context.browser}`,
    `Platform: ${context.platform}`,
    `Locale: ${context.locale}`,
  ].join("\n");

export const buildBugReportContextBlock = (context: BugReportContext): string =>
  [
    "```text",
    `version=${context.version}`,
    `runtime_mode=${context.runtimeMode}`,
    `route=${context.route}`,
    `query_keys=${context.queryKeys}`,
    `theme_selection=${context.themeSelection}`,
    `theme_resolved=${context.themeResolved}`,
    `viewport=${context.viewport}`,
    `browser=${context.browser}`,
    `platform=${context.platform}`,
    `locale=${context.locale}`,
    "```",
  ].join("\n");

export const buildBugReportIssueUrl = ({
  newIssueUrl = DEFAULT_BUG_REPORT_NEW_ISSUE_URL,
  context = collectBugReportContext(),
}: {
  newIssueUrl?: string;
  context?: BugReportContext;
} = {}): string => {
  const params = new URLSearchParams();
  params.set("template", BUG_REPORT_ISSUE_TEMPLATE);
  params.set("version", sanitizeSingleLine(context.version, 120));
  params.set(
    "environment",
    sanitizeMultiline(buildBugReportEnvironmentText(context), MAX_FIELD_LENGTH),
  );
  params.set("context", sanitizeMultiline(buildBugReportContextBlock(context), MAX_FIELD_LENGTH));

  return `${newIssueUrl}?${params.toString()}`;
};

export const copyBugReportContext = async (context: BugReportContext): Promise<boolean> => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(buildBugReportContextBlock(context));
    return true;
  } catch {
    return false;
  }
};
