/**
 * @module models/dashboardValidation
 * @description Validate a portable dashboard payload against the v1
 * DashboardDocument contract at the import trust boundary. Pure and
 * framework-free so it can move to `@freeboard/dashboard-core` later.
 *
 * Pipeline: non-object guard -> raw schemaVersion gate (BEFORE migrate, because
 * migrate stamps schemaVersion=1) -> migrate -> structural (Ajv 2020-12 against
 * the canonical schema) -> semantic invariants. Never throws, never mutates;
 * returns the migrated document only when valid.
 *
 * This module statically imports Ajv and the schema; it is reached only via a
 * dynamic `import()` from the store, so Ajv lands in a lazy chunk off the player
 * path. Do not add an eager (static) import of this module.
 */

import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import schemaJson from "../../../../schema/dashboard-document.v1.schema.json";
import {
  DASHBOARD_DOCUMENT_SCHEMA_VERSION,
  migrateDashboardDocument,
} from "./dashboardDocument.js";
import { RESERVED_DATASOURCE_TITLES, normalizeDatasourceTitle } from "./dashboardRuntime.js";
import type { UnknownRecord } from "../types/runtime.js";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  /** Stable machine key, dot.case (e.g. "schema.required", "version.future"). */
  code: string;
  /** RFC 6901 JSON Pointer to the offending node ("" = document root). */
  path: string;
  /** Human-readable default message (UI may render `message (path)`). */
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** The migrated, validated document. Present iff `valid`. */
  document?: UnknownRecord;
}

let compiledValidator: ValidateFunction | undefined;

const getValidator = (): ValidateFunction => {
  if (!compiledValidator) {
    const ajv = new Ajv2020({ allErrors: true });
    compiledValidator = ajv.compile(schemaJson as object);
  }
  return compiledValidator;
};

const isPlainObject = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const mapStructuralError = (error: ErrorObject): ValidationIssue => {
  let path = error.instancePath || "";
  const params = (error.params ?? {}) as Record<string, unknown>;
  if (error.keyword === "required" && typeof params.missingProperty === "string") {
    path = `${path}/${params.missingProperty}`;
  } else if (
    error.keyword === "additionalProperties" &&
    typeof params.additionalProperty === "string"
  ) {
    path = `${path}/${params.additionalProperty}`;
  }

  let message = error.message || "is invalid";
  if (error.keyword === "enum" && Array.isArray(params.allowedValues)) {
    message = `must be one of: ${params.allowedValues.join(", ")}`;
  }

  return { code: `schema.${error.keyword}`, path, message, severity: "error" };
};

const collectSemanticIssues = (
  document: UnknownRecord,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void => {
  const datasources = Array.isArray(document.datasources) ? document.datasources : [];
  const panes = Array.isArray(document.panes) ? document.panes : [];

  const seenDatasourceId = new Set<string>();
  const seenTitle = new Set<string>();
  datasources.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      return;
    }
    if (typeof entry.id === "string") {
      if (seenDatasourceId.has(entry.id)) {
        errors.push({
          code: "semantic.datasourceIdDuplicate",
          path: `/datasources/${index}/id`,
          message: `Duplicate datasource id "${entry.id}".`,
          severity: "error",
        });
      } else {
        seenDatasourceId.add(entry.id);
      }
    }
    const normalizedTitle = normalizeDatasourceTitle(entry.title);
    if (normalizedTitle) {
      if (RESERVED_DATASOURCE_TITLES.has(normalizedTitle)) {
        errors.push({
          code: "semantic.datasourceTitleReserved",
          path: `/datasources/${index}/title`,
          message: `Datasource title "${String(entry.title)}" is reserved.`,
          severity: "error",
        });
      } else if (seenTitle.has(normalizedTitle)) {
        warnings.push({
          code: "semantic.datasourceTitleDuplicate",
          path: `/datasources/${index}/title`,
          message: `Duplicate datasource title "${String(entry.title)}".`,
          severity: "warning",
        });
      } else {
        seenTitle.add(normalizedTitle);
      }
    }
  });

  const seenPaneId = new Set<string>();
  const seenWidgetId = new Set<string>();
  panes.forEach((pane, paneIndex) => {
    if (!isPlainObject(pane)) {
      return;
    }
    if (typeof pane.id === "string") {
      if (seenPaneId.has(pane.id)) {
        errors.push({
          code: "semantic.paneIdDuplicate",
          path: `/panes/${paneIndex}/id`,
          message: `Duplicate pane id "${pane.id}".`,
          severity: "error",
        });
      } else {
        seenPaneId.add(pane.id);
      }
      const layout = isPlainObject(pane.layout) ? pane.layout : undefined;
      const layoutId = layout && typeof layout.i === "string" ? layout.i : undefined;
      if (layoutId !== undefined && layoutId !== pane.id) {
        warnings.push({
          code: "semantic.paneIdLayoutMismatch",
          path: `/panes/${paneIndex}/id`,
          message: `Pane id "${pane.id}" does not match layout.i "${layoutId}".`,
          severity: "warning",
        });
      }
    }
    const widgets = Array.isArray(pane.widgets) ? pane.widgets : [];
    widgets.forEach((widget, widgetIndex) => {
      if (!isPlainObject(widget) || typeof widget.id !== "string") {
        return;
      }
      if (seenWidgetId.has(widget.id)) {
        errors.push({
          code: "semantic.widgetIdDuplicate",
          path: `/panes/${paneIndex}/widgets/${widgetIndex}/id`,
          message: `Duplicate widget id "${widget.id}".`,
          severity: "error",
        });
      } else {
        seenWidgetId.add(widget.id);
      }
    });
  });
};

/**
 * Validate a raw dashboard payload against the v1 contract.
 *
 * @param {unknown} input - Untrusted dashboard JSON (file import).
 * @returns {ValidationResult} `document` is the migrated doc iff `valid`.
 */
export const validateDashboardDocument = (input: unknown): ValidationResult => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    errors.push({
      code: "input.notObject",
      path: "",
      message: "Dashboard document must be a JSON object.",
      severity: "error",
    });
    return { valid: false, errors, warnings };
  }

  // Version gate on RAW input: migrate() unconditionally stamps schemaVersion=1,
  // so a future/malformed version must be classified before migrate runs.
  if (input.schemaVersion !== undefined) {
    const version = input.schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      errors.push({
        code: "version.invalid",
        path: "/schemaVersion",
        message: `Invalid schemaVersion: ${JSON.stringify(version)}.`,
        severity: "error",
      });
      return { valid: false, errors, warnings };
    }
    if (version > DASHBOARD_DOCUMENT_SCHEMA_VERSION) {
      errors.push({
        code: "version.future",
        path: "/schemaVersion",
        message: `Unsupported schemaVersion ${version}; this build supports up to ${DASHBOARD_DOCUMENT_SCHEMA_VERSION}.`,
        severity: "error",
      });
      return { valid: false, errors, warnings };
    }
  }

  const migrated = migrateDashboardDocument(input);

  const validate = getValidator();
  if (!validate(migrated)) {
    for (const error of validate.errors ?? []) {
      errors.push(mapStructuralError(error));
    }
    return { valid: false, errors, warnings };
  }

  collectSemanticIssues(migrated, errors, warnings);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }
  return { valid: true, errors, warnings, document: migrated };
};
