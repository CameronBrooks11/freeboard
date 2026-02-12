/**
 * @module models/dashboardRuntime
 * @description Pure helpers for dashboard runtime behavior and serialization.
 */

import { normalizeDatasourceValue } from "../widgets/runtime/bindings.js";

const RESERVED_DATASOURCE_TITLES = new Set(["datasources", "datasourcetitles"]);

/**
 * Build a normalized datasource snapshot map keyed by datasource id,
 * with legacy title aliases when unambiguous.
 *
 * @param {Array<any>} datasources
 * @returns {Record<string, any>}
 */
export const buildDatasourceSnapshot = (datasources = []) => {
  const snapshot = {
    datasources: {},
    datasourceTitles: {},
  };
  const duplicateTitles = new Set();

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
 * Determine whether a datasource title conflicts with another datasource.
 *
 * @param {Array<any>} datasources
 * @param {string} title
 * @param {string|null} [excludeId]
 * @returns {boolean}
 */
export const hasDatasourceTitleConflict = (
  datasources,
  title,
  excludeId = null
) => {
  const candidate = String(title || "").trim().toLowerCase();
  if (!candidate) {
    return true;
  }

  if (RESERVED_DATASOURCE_TITLES.has(candidate)) {
    return true;
  }

  return datasources.some((datasource) => {
    if (!datasource) {
      return false;
    }

    if (excludeId && datasource.id === excludeId) {
      return false;
    }

    return String(datasource.title || "").trim().toLowerCase() === candidate;
  });
};

/**
 * Ensure datasource title is unique and non-reserved.
 *
 * @param {Array<any>} datasources
 * @param {string} title
 * @param {string|null} [excludeId]
 * @returns {string}
 */
export const ensureUniqueDatasourceTitle = (datasources, title, excludeId = null) => {
  const base = String(title || "").trim() || "Datasource";
  let candidate = base;
  let suffix = 2;

  while (hasDatasourceTitleConflict(datasources, candidate, excludeId)) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }

  return candidate;
};

/**
 * Compute minimum rows required for a pane based on widget preferred rows.
 *
 * @param {any} pane
 * @returns {number}
 */
export const getPaneMinRows = (pane) => {
  const widgetRows =
    pane?.widgets?.reduce((sum, widget) => {
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
export const clampPaneLayoutHeights = (panes) => {
  panes.forEach((pane) => {
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
  value,
  oldTitle,
  newTitle,
  fieldName = ""
) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceDatasourceReferences(item, oldTitle, newTitle, fieldName)
    );
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, innerValue]) => [
        key,
        replaceDatasourceReferences(innerValue, oldTitle, newTitle, key),
      ])
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  const shouldRewrite =
    /(?:path|template|binding)$/i.test(fieldName) || fieldName === "";
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
export const serializeDashboardState = (dashboard, version) => {
  const panes = [];
  dashboard.panes.forEach((pane) => {
    panes.push(pane.serialize());
  });

  const datasources = [];
  dashboard.datasources.forEach((datasource) => {
    datasources.push(datasource.serialize());
  });

  const authProviders = [];
  dashboard.authProviders.forEach((authProvider) => {
    authProviders.push(authProvider.serialize());
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
    authProviders,
    settings: dashboard.settings,
  };
};
