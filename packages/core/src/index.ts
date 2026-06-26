/**
 * @module @freeboard/core
 * @description Portable dashboard document layer: schema, migration, and pure
 * datasource-title helpers. Framework-free (Node/no-DOM).
 *
 * The Ajv-backed validator lives in the `./validate.js` subpath, NOT in this
 * barrel, so consumers can keep it in a lazily-loaded chunk. This barrel
 * re-exports only the validator's TYPES (erased at build) — never value-export
 * from "./validate".
 */

export {
  DASHBOARD_DOCUMENT_SCHEMA_VERSION,
  ENVELOPE_KEYS,
  migrateDashboardDocument,
} from "./dashboardDocument.js";
export {
  RESERVED_DATASOURCE_TITLES,
  normalizeDatasourceTitle,
  hasDatasourceTitleConflict,
  ensureUniqueDatasourceTitle,
} from "./datasourceTitles.js";
export type { UnknownRecord } from "./types.js";
export type { ValidationIssue, ValidationResult, ValidationSeverity } from "./validate.js";
