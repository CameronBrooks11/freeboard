/**
 * @module widgets/runtime/bindings
 * @description Utilities for resolving widget bindings from normalized datasource snapshots.
 */

const DATASOURCES_PREFIX = "datasources.";
const DATASOURCES_NODE = "datasources";

/**
 * Convert a path string into path segments.
 * Supports dot notation and bracket notation, e.g. `a.b[0][\"c\"]`.
 *
 * @param {string} path
 * @returns {Array<string|number>}
 */
export const toPathSegments = (path) => {
  if (!path || typeof path !== "string") {
    return [];
  }

  const segments = [];
  const source = path.trim();
  const regex = /\[(.+?)\]|[^.[\]]+/g;

  source.replace(regex, (match, bracket) => {
    let part = bracket ?? match;

    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      part = part.slice(1, -1);
    }

    if (/^\d+$/.test(part)) {
      segments.push(Number(part));
    } else if (part.length > 0) {
      segments.push(part);
    }

    return "";
  });

  return segments;
};

/**
 * Resolve a binding path from the datasource snapshot.
 * Path format is `<datasourceTitle>.<path.to.value>`.
 *
 * @param {string} bindingPath
 * @param {Record<string, any>} snapshot
 * @returns {any}
 */
export const resolveBinding = (bindingPath, snapshot) => {
  if (!bindingPath || typeof bindingPath !== "string" || !snapshot) {
    return undefined;
  }

  let path = bindingPath.trim();

  if (path.startsWith(DATASOURCES_PREFIX)) {
    path = path.slice(DATASOURCES_PREFIX.length);
  }

  const segments = toPathSegments(path);
  if (!segments.length) {
    return undefined;
  }

  const fromDatasourcesNode = segments[0] === DATASOURCES_NODE;
  let sourceRef = segments[0];
  let rest = segments.slice(1);

  if (fromDatasourcesNode) {
    sourceRef = segments[1];
    rest = segments.slice(2);
  }

  let sourceId = sourceRef;
  if (
    typeof sourceRef === "string" &&
    snapshot.datasourceTitles &&
    sourceRef in snapshot.datasourceTitles
  ) {
    sourceId = snapshot.datasourceTitles[sourceRef];
  }

  let current;
  if (snapshot.datasources && sourceId in snapshot.datasources) {
    current = snapshot.datasources[sourceId];
  } else {
    // Legacy fallback for dashboards still using title-root bindings.
    current = snapshot[sourceRef];
  }

  for (const segment of rest) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

/**
 * Resolve `{{ binding.path }}` placeholders in a template string.
 *
 * @param {string} template
 * @param {Record<string, any>} snapshot
 * @returns {string}
 */
export const resolveTemplate = (template, snapshot) => {
  if (typeof template !== "string" || !template.length) {
    return "";
  }

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => {
    const value = resolveBinding(path, snapshot);
    return value === null || value === undefined ? "" : String(value);
  });
};

/**
 * Normalize datasource model output for widget consumption.
 *
 * @param {any} latestData
 * @returns {any}
 */
export const normalizeDatasourceValue = (latestData) =>
  latestData && typeof latestData === "object" && "data" in latestData
    ? latestData.data
    : latestData;
