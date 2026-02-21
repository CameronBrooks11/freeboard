/**
 * @module ui/themeCatalog
 * Canonical dashboard theme metadata used by settings UI and runtime resolution.
 */

import { DASHBOARD_THEME_PRESETS, type DashboardThemePreset } from "../models/Dashboard.js";

type ThemeSwatchTuple = readonly [string, string, string];

export type DashboardThemeCatalogEntry = {
  value: DashboardThemePreset;
  labelKey: string;
  previewSwatches: ThemeSwatchTuple;
};

const entries: DashboardThemeCatalogEntry[] = [
  {
    value: "auto",
    labelKey: "form.labelThemeAuto",
    previewSwatches: ["#f8fafc", "#111827", "#2563eb"],
  },
  {
    value: "light",
    labelKey: "form.labelThemeLight",
    previewSwatches: ["#f8fafc", "#0f172a", "#2563eb"],
  },
  {
    value: "paper",
    labelKey: "form.labelThemePaper",
    previewSwatches: ["#fcfaf5", "#1f2937", "#0f766e"],
  },
  {
    value: "dark",
    labelKey: "form.labelThemeDark",
    previewSwatches: ["#0b1220", "#e5e7eb", "#60a5fa"],
  },
  {
    value: "slate",
    labelKey: "form.labelThemeSlate",
    previewSwatches: ["#0f172a", "#e2e8f0", "#38bdf8"],
  },
  {
    value: "high-contrast",
    labelKey: "form.labelThemeHighContrast",
    previewSwatches: ["#000000", "#ffffff", "#ffff00"],
  },
  {
    value: "colorblind",
    labelKey: "form.labelThemeColorblind",
    previewSwatches: ["#f7f8fb", "#1f2937", "#e69f00"],
  },
  {
    value: "amber-night",
    labelKey: "form.labelThemeAmberNight",
    previewSwatches: ["#140f07", "#f8e7c7", "#f59e0b"],
  },
];

const hasExactCatalogCoverage = (): boolean => {
  const presetSet = new Set<string>(DASHBOARD_THEME_PRESETS);
  const entrySet = new Set<string>(entries.map((entry) => entry.value));

  if (presetSet.size !== entrySet.size) {
    return false;
  }

  for (const value of presetSet) {
    if (!entrySet.has(value)) {
      return false;
    }
  }

  return true;
};

if (!hasExactCatalogCoverage()) {
  throw new Error(
    "Dashboard theme catalog is out of sync with DASHBOARD_THEME_PRESETS. Update ui/themeCatalog.ts.",
  );
}

export const DASHBOARD_THEME_CATALOG = Object.freeze(entries);
