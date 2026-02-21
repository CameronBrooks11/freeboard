/**
 * @module ui/themeRuntime
 * Shared dashboard theme application/runtime helpers.
 */

import { normalizeDashboardTheme } from "../models/Dashboard.js";

const THEME_SELECTION_ATTRIBUTE = "data-theme-selection";
const THEME_ATTRIBUTE = "data-theme";

const isSystemDarkMode = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolveThemeFromSelection = (selection: string): string =>
  selection === "auto" ? (isSystemDarkMode() ? "dark" : "light") : selection;

const resolveColorScheme = (resolvedTheme: string): "light" | "dark" =>
  resolvedTheme === "light" ? "light" : "dark";

const getThemeTarget = (): HTMLElement | null => {
  if (typeof document === "undefined") {
    return null;
  }
  return document.documentElement || null;
};

export const applyDashboardThemeSelection = (selectionValue: unknown) => {
  const normalizedSelection = normalizeDashboardTheme(selectionValue);
  const resolvedTheme = resolveThemeFromSelection(normalizedSelection);
  const target = getThemeTarget();

  if (!target) {
    return {
      selection: normalizedSelection,
      resolvedTheme,
      colorScheme: resolveColorScheme(resolvedTheme),
    };
  }

  target.setAttribute(THEME_SELECTION_ATTRIBUTE, normalizedSelection);
  target.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
  target.style.colorScheme = resolveColorScheme(resolvedTheme);

  return {
    selection: normalizedSelection,
    resolvedTheme,
    colorScheme: resolveColorScheme(resolvedTheme),
  };
};

export const subscribeToSystemThemeChanges = (onChange: () => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    onChange();
  };

  mediaQuery.addEventListener("change", listener);
  return () => {
    mediaQuery.removeEventListener("change", listener);
  };
};
