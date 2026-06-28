/**
 * @module validate
 * @description Validate a portable dashboard payload against the v1
 * DashboardDocument contract. Pure and framework-free (Node/no-DOM).
 *
 * Pipeline: non-object guard -> raw schemaVersion gate (BEFORE migrate, because
 * migrate stamps schemaVersion=1) -> migrate -> structural (Ajv 2020-12 against
 * the canonical schema) -> semantic invariants. Never throws, never mutates;
 * returns the migrated document only when valid.
 *
 * This is the ONLY module in the package that imports Ajv and the schema. It is
 * exposed as the `./validate.js` subpath so browser consumers can reach it via a
 * dynamic `import()` and keep Ajv in a lazy chunk off the player path. Never add
 * an eager (value) re-export of this module from the package barrel.
 */

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";

import schemaJson from "./schema/dashboard-document.v1.schema.json" with { type: "json" };
import {
  DASHBOARD_DOCUMENT_SCHEMA_VERSION,
  migrateDashboardDocument,
} from "./dashboardDocument.js";
import { RESERVED_DATASOURCE_TITLES, normalizeDatasourceTitle } from "./datasourceTitles.js";
import { PLUGIN_MANIFEST, RESOURCE_LIMITS, getManifestEntry } from "./manifest.js";
import type { ManifestField, PluginManifestEntry } from "./manifest.js";
import type { UnknownRecord } from "./types.js";

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

// RFC 6901: `~` and `/` in a property name must be escaped when appended to a
// JSON Pointer. Ajv's `instancePath` is already escaped; appended keys are not.
const escapePointerSegment = (segment: string): string =>
  segment.replace(/~/g, "~0").replace(/\//g, "~1");

const mapStructuralError = (error: ErrorObject): ValidationIssue => {
  let path = error.instancePath || "";
  const params = (error.params ?? {}) as Record<string, unknown>;
  if (error.keyword === "required" && typeof params.missingProperty === "string") {
    path = `${path}/${escapePointerSegment(params.missingProperty)}`;
  } else if (
    error.keyword === "additionalProperties" &&
    typeof params.additionalProperty === "string"
  ) {
    path = `${path}/${escapePointerSegment(params.additionalProperty)}`;
  }

  let message = error.message || "is invalid";
  if (error.keyword === "enum" && Array.isArray(params.allowedValues)) {
    message = `must be one of: ${params.allowedValues.join(", ")}`;
  }

  return { code: `schema.${error.keyword}`, path, message, severity: "error" };
};

/** Depth of the deepest nested object/array, short-circuiting once over `limit`. */
const nestingDepth = (value: unknown, limit: number, depth = 1): number => {
  if (depth > limit || value === null || typeof value !== "object") {
    return depth;
  }
  let max = depth;
  for (const child of Object.values(value as Record<string, unknown>)) {
    const childDepth = nestingDepth(child, limit, depth + 1);
    if (childDepth > max) {
      max = childDepth;
    }
    if (max > limit) {
      return max;
    }
  }
  return max;
};

const collectResourceLimitIssues = (document: UnknownRecord, errors: ValidationIssue[]): void => {
  const datasources = Array.isArray(document.datasources) ? document.datasources : [];
  const panes = Array.isArray(document.panes) ? document.panes : [];
  const widgetCount = panes.reduce(
    (sum, pane) =>
      sum + (isPlainObject(pane) && Array.isArray(pane.widgets) ? pane.widgets.length : 0),
    0,
  );

  const overLimit = (count: number, max: number, code: string, path: string, label: string) => {
    if (count > max) {
      errors.push({
        code,
        path,
        message: `Too many ${label}: ${count} (max ${max}).`,
        severity: "error",
      });
    }
  };
  overLimit(
    datasources.length,
    RESOURCE_LIMITS.maxDatasources,
    "limit.datasources",
    "/datasources",
    "datasources",
  );
  overLimit(panes.length, RESOURCE_LIMITS.maxPanes, "limit.panes", "/panes", "panes");
  overLimit(widgetCount, RESOURCE_LIMITS.maxWidgets, "limit.widgets", "/panes", "widgets");

  // Bound nesting depth to protect recursive consumers (settings/layout are open).
  if (nestingDepth(document, RESOURCE_LIMITS.maxNestingDepth) > RESOURCE_LIMITS.maxNestingDepth) {
    errors.push({
      code: "limit.depth",
      path: "",
      message: `Document nesting is too deep (max ${RESOURCE_LIMITS.maxNestingDepth} levels).`,
      severity: "error",
    });
  }
};

/** Trim + optional compare-only case fold (mirrors the server's comparison semantics). */
const coerceForCompare = (value: unknown, coerce?: "upper" | "lower"): string => {
  const trimmed = String(value).trim();
  if (coerce === "upper") return trimmed.toUpperCase();
  if (coerce === "lower") return trimmed.toLowerCase();
  return trimmed;
};

const matchesDataType = (value: unknown, dataType: ManifestField["dataType"]): boolean => {
  const types = Array.isArray(dataType) ? dataType : [dataType];
  return types.some((type) => {
    switch (type) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return value !== null && typeof value === "object" && !Array.isArray(value);
      default:
        return false;
    }
  });
};

/**
 * Validate one settings field against its manifest constraints, matching the
 * server's `validateDashboardDatasources` semantics exactly (including the
 * fields' check order, so the first collected issue equals the server's
 * first-thrown one). Collects into `errors`; never throws.
 */
const collectFieldIssues = (
  entry: PluginManifestEntry,
  field: ManifestField,
  settings: UnknownRecord,
  basePath: string,
  errors: ValidationIssue[],
): void => {
  const value = settings[field.name];
  const path = `${basePath}/settings/${field.name}`;
  const isAbsent = value === undefined || value === null;
  const push = (code: string, message: string) =>
    errors.push({ code, path, message, severity: "error" });

  // typeCheck gates on `!== undefined` (the server rejects an explicit null too).
  if (field.typeCheck && value !== undefined && !matchesDataType(value, field.dataType)) {
    push("manifest.settings.type", `${entry.typeName} ${field.name} has an invalid type.`);
  }

  // required: trimmed value must be non-empty (server: String(v || "").trim()).
  if (field.required && String(value || "").trim() === "") {
    push("manifest.settings.required", `${entry.typeName} requires a non-empty ${field.name}.`);
    return;
  }

  // requiredWhen: required-non-empty when a sibling field (compared after ITS
  // coerce) equals the trigger value.
  if (field.requiredWhen) {
    const sibling = entry.fields.find((f) => f.name === field.requiredWhen?.field);
    const siblingValue = coerceForCompare(settings[field.requiredWhen.field], sibling?.coerce);
    if (siblingValue === String(field.requiredWhen.equals) && String(value || "").trim() === "") {
      push(
        "manifest.settings.requiredWhen",
        `${entry.typeName} requires ${field.name} when ${field.requiredWhen.field} is ${field.requiredWhen.equals}.`,
      );
      return;
    }
  }

  // nonEmpty: present-but-blank string is rejected (e.g. an empty credentialProfileId).
  if (field.nonEmpty && !isAbsent && String(value).trim() === "") {
    push("manifest.settings.nonEmpty", `${entry.typeName} ${field.name} must not be empty.`);
    return;
  }

  if (isAbsent) {
    return;
  }

  if (field.enum && !field.enum.map(String).includes(coerceForCompare(value, field.coerce))) {
    push(
      "manifest.settings.enum",
      `${entry.typeName} ${field.name} must be one of: ${field.enum.join(", ")}.`,
    );
  }

  if (field.min !== undefined || field.max !== undefined) {
    const num = Number(value);
    if (
      !Number.isFinite(num) ||
      (field.min !== undefined && num < field.min) ||
      (field.max !== undefined && num > field.max)
    ) {
      push(
        "manifest.settings.range",
        `${entry.typeName} ${field.name} must be between ${field.min ?? "-∞"} and ${field.max ?? "∞"}.`,
      );
    }
  }
};

/**
 * Manifest-driven datasource settings validation. Replaces the server's
 * hardcoded per-type rules with the declarative manifest, so core is the single
 * settings-validation chokepoint (the server validator delegates here too).
 * Unknown datasource type is an error (closed-world, matching the server).
 *
 * Non-object entries are skipped — structural shape is the schema's job (the
 * core pipeline runs Ajv first; the server shim keeps its own object/array
 * guards). Issues come out in field order, so the first one equals the server's
 * (formerly) first-thrown rule.
 *
 * @param {unknown} datasources - the document's `datasources` array (raw or migrated).
 * @returns {ValidationIssue[]}
 */
const ALLOWED_DATASOURCE_TYPE_NAMES = PLUGIN_MANIFEST.filter((entry) => entry.kind === "datasource")
  .map((entry) => entry.typeName)
  .join(", ");

export const collectDatasourceManifestIssues = (datasources: unknown): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const list = Array.isArray(datasources) ? datasources : [];
  list.forEach((datasource, index) => {
    if (!isPlainObject(datasource)) {
      return;
    }
    const type = String(datasource.type || "")
      .trim()
      .toLowerCase();
    const entry = getManifestEntry("datasource", type);
    if (!entry) {
      issues.push({
        code: "manifest.unknownType",
        path: `/datasources/${index}/type`,
        message: `Datasource type '${type || "unknown"}' is not supported. Allowed: ${ALLOWED_DATASOURCE_TYPE_NAMES}.`,
        severity: "error",
      });
      return;
    }
    const settings = isPlainObject(datasource.settings) ? datasource.settings : {};
    for (const field of entry.fields) {
      collectFieldIssues(entry, field, settings, `/datasources/${index}`, issues);
    }
  });
  return issues;
};

/** Widget validation is a later slice; runs on structurally-valid documents. */
const collectManifestIssues = (document: UnknownRecord, errors: ValidationIssue[]): void => {
  errors.push(...collectDatasourceManifestIssues(document.datasources));
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
      // `pane.id` is the canonical identity and `layout.i` must mirror it. A
      // mismatch is rejected (not merely warned) so identity can't silently
      // change across an import→export round-trip — the document must pick one.
      if (layoutId !== undefined && layoutId !== pane.id) {
        errors.push({
          code: "semantic.paneIdLayoutMismatch",
          path: `/panes/${paneIndex}/id`,
          message: `Pane id "${pane.id}" does not match layout.i "${layoutId}".`,
          severity: "error",
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
  collectResourceLimitIssues(migrated, errors);
  collectManifestIssues(migrated, errors);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }
  return { valid: true, errors, warnings, document: migrated };
};
