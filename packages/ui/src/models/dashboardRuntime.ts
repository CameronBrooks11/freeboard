/**
 * @module models/dashboardRuntime
 * @description Pure helpers for dashboard runtime behavior and serialization.
 */

import { RESERVED_DATASOURCE_TITLES } from "@freeboard/core";
import { normalizeDatasourceValue } from "../widgets/runtime/bindings.js";
import type { UnknownRecord } from "../types/runtime.js";
import type { Datasource } from "./Datasource.js";
import type { Pane } from "./Pane.js";
import type { Widget } from "./Widget.js";

// The pure datasource-title helpers now live in @freeboard/core
// (single source of truth shared with the validator). Re-exported here so
// existing import sites (Dashboard.ts, etc.) keep working unchanged.
export {
  RESERVED_DATASOURCE_TITLES,
  ensureUniqueDatasourceTitle,
  hasDatasourceTitleConflict,
  normalizeDatasourceTitle,
} from "@freeboard/core";

type DatasourceSnapshot = Record<string, unknown> & {
  datasources: Record<string, unknown>;
  datasourceTitles: Record<string, string>;
};

type PaneLike = Pick<Pane, "layout" | "widgets" | "serialize">;
type DashboardLike = {
  panes: PaneLike[];
  datasources: Datasource[];
  _id: string | null;
  title: string;
  visibility: string;
  image: string | null;
  columns: number;
  width: string;
  settings: UnknownRecord;
};

/**
 * Build a normalized datasource snapshot map keyed by datasource id,
 * with legacy title aliases when unambiguous.
 *
 * @param {Array<any>} datasources
 * @returns {Record<string, unknown>}
 */
export const buildDatasourceSnapshot = (datasources: Datasource[] = []): DatasourceSnapshot => {
  const snapshot: DatasourceSnapshot = {
    datasources: {},
    datasourceTitles: {},
  };
  const duplicateTitles = new Set<string>();

  datasources.forEach((datasource) => {
    if (!datasource?.id) {
      return;
    }

    const normalizedValue = normalizeDatasourceValue(datasource.latestData);
    snapshot.datasources[datasource.id] = normalizedValue;
    snapshot[datasource.id] = normalizedValue;

    const title = String(datasource.title || "").trim();
    if (!title) {
      return;
    }
    const normalizedTitle = title.toLowerCase();
    if (RESERVED_DATASOURCE_TITLES.has(normalizedTitle)) {
      return;
    }

    if (title in snapshot.datasourceTitles) {
      duplicateTitles.add(title);
      return;
    }

    snapshot.datasourceTitles[title] = datasource.id;
    // Legacy fallback support.
    snapshot[title] = normalizedValue;
  });

  duplicateTitles.forEach((title) => {
    delete snapshot.datasourceTitles[title];
    delete snapshot[title];
  });

  return snapshot;
};

/**
 * Compute minimum rows required for a pane based on widget preferred rows.
 *
 * @param {any} pane
 * @returns {number}
 */
export const getPaneMinRows = (pane: PaneLike): number => {
  const widgetRows =
    pane?.widgets?.reduce((sum: number, widget: Widget) => {
      if (!widget || typeof widget.getPreferredRows !== "function") {
        return sum + 1;
      }
      return sum + Math.max(1, Number(widget.getPreferredRows()) || 1);
    }, 0) || 1;

  return Math.max(1, Math.ceil(widgetRows));
};

/**
 * Clamp pane layout heights to minimum content requirements.
 *
 * @param {Array<any>} panes
 */
export const clampPaneLayoutHeights = (panes: PaneLike[]): void => {
  panes.forEach((pane: PaneLike) => {
    if (!pane.layout || typeof pane.layout !== "object") {
      pane.layout = {};
    }

    const minRows = getPaneMinRows(pane);
    const currentRows = Number(pane.layout.h);
    pane.layout.h = Number.isFinite(currentRows)
      ? Math.max(Math.ceil(currentRows), minRows)
      : minRows;
  });
};

/**
 * Recursively replace datasource title references inside widget settings.
 *
 * @param {any} value
 * @param {string} oldTitle
 * @param {string} newTitle
 * @param {string} [fieldName]
 * @returns {any}
 */
export const replaceDatasourceReferences = (
  value: unknown,
  oldTitle: string,
  newTitle: string,
  fieldName = "",
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => replaceDatasourceReferences(item, oldTitle, newTitle, fieldName));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, innerValue]) => [
        key,
        replaceDatasourceReferences(innerValue, oldTitle, newTitle, key),
      ]),
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  const shouldRewrite = /(?:path|template|binding)$/i.test(fieldName) || fieldName === "";
  if (!shouldRewrite) {
    return value;
  }

  const escapedOldTitle = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bindingRootRegex = new RegExp(`^\\s*${escapedOldTitle}(?=\\.|\\[)`);
  const templateRegex = new RegExp(`\\{\\{\\s*${escapedOldTitle}(?=\\.|\\[)`, "g");

  let next = value;
  if (bindingRootRegex.test(next)) {
    next = next.replace(bindingRootRegex, newTitle);
  }

  next = next.replace(templateRegex, `{{ ${newTitle}`);

  return next;
};

/**
 * Serialize dashboard state to a plain object.
 *
 * @param {Object} dashboard
 * @param {string} version
 * @returns {Object}
 */
export const serializeDashboardState = (
  dashboard: DashboardLike,
  version: string,
): UnknownRecord => {
  const panes: UnknownRecord[] = [];
  dashboard.panes.forEach((pane: PaneLike) => {
    panes.push(pane.serialize());
  });

  const datasources: UnknownRecord[] = [];
  dashboard.datasources.forEach((datasource: Datasource) => {
    datasources.push(datasource.serialize());
  });

  return {
    version,
    _id: dashboard._id,
    title: dashboard.title,
    visibility: dashboard.visibility,
    image: dashboard.image,
    columns: dashboard.columns,
    width: dashboard.width,
    datasources,
    panes,
    settings: dashboard.settings,
  };
};
