/**
 * @module datasourceTitles
 * @description Pure helpers for datasource title normalization and conflict
 * detection. Single source of truth shared by the UI runtime and the validator.
 */

export const RESERVED_DATASOURCE_TITLES = new Set(["datasources", "datasourcetitles"]);

/**
 * Normalize a datasource title for conflict/reserved comparisons: trim and
 * lowercase.
 *
 * @param {unknown} title
 * @returns {string}
 */
export const normalizeDatasourceTitle = (title: unknown): string =>
  String(title ?? "")
    .trim()
    .toLowerCase();

/** Minimal structural shape the title helpers read (accepts the UI Datasource). */
type DatasourceTitleEntry = { id: string; title?: unknown };

/**
 * Determine whether a datasource title conflicts with another datasource
 * (reserved, empty, or a case-insensitive duplicate).
 *
 * @param {ReadonlyArray<DatasourceTitleEntry>} datasources
 * @param {string} title
 * @param {string|null} [excludeId]
 * @returns {boolean}
 */
export const hasDatasourceTitleConflict = (
  datasources: ReadonlyArray<DatasourceTitleEntry>,
  title: string,
  excludeId: string | null = null,
): boolean => {
  const candidate = normalizeDatasourceTitle(title);
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

    return normalizeDatasourceTitle(datasource.title) === candidate;
  });
};

/**
 * Ensure a datasource title is unique and non-reserved, suffixing as needed.
 *
 * @param {ReadonlyArray<DatasourceTitleEntry>} datasources
 * @param {string} title
 * @param {string|null} [excludeId]
 * @returns {string}
 */
export const ensureUniqueDatasourceTitle = (
  datasources: ReadonlyArray<DatasourceTitleEntry>,
  title: string,
  excludeId: string | null = null,
): string => {
  const base = String(title || "").trim() || "Datasource";
  let candidate = base;
  let suffix = 2;

  while (hasDatasourceTitleConflict(datasources, candidate, excludeId)) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }

  return candidate;
};
