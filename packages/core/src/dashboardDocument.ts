/**
 * @module dashboardDocument
 * @description Portable dashboard-document helpers: the boundary between the
 * server record (envelope + content) and the portable, self-contained
 * DashboardDocument. Pure and framework-free. The canonical contract lives in
 * `./schema/dashboard-document.v1.schema.json`.
 */

import type { UnknownRecord } from "./types.js";

/** Current portable document schema version (migration key). */
export const DASHBOARD_DOCUMENT_SCHEMA_VERSION = 1;

/**
 * Server-owned fields that must never appear in a portable document. They live
 * in the server record envelope, not the document.
 * @constant {readonly string[]}
 */
export const ENVELOPE_KEYS = Object.freeze([
  "_id",
  "user",
  "visibility",
  "shareToken",
  "shareTokenVersion",
  "acl",
  "isOwner",
  "canEdit",
  "canManageSharing",
  "revision",
  "createdAt",
  "updatedAt",
]);

const cloneRecord = (value: unknown): UnknownRecord => {
  if (!value || typeof value !== "object") {
    return {};
  }
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value) as UnknownRecord;
    } catch {
      // Fall through to JSON clone.
    }
  }
  return JSON.parse(JSON.stringify(value)) as UnknownRecord;
};

/**
 * Normalize a raw dashboard payload (a legacy export or a current document)
 * into a v1 DashboardDocument. Pure, non-mutating, and idempotent on documents
 * that are already current.
 *
 * - strips server-owned envelope fields,
 * - folds the pre-v1 top-level `version` string into `generator` (provenance),
 * - stamps `schemaVersion`,
 * - ensures every pane carries a stable `id` (mirrors the grid `layout.i`).
 *
 * Structural/semantic validation is layered on top of this in a later phase;
 * `migrate` only normalizes shape.
 *
 * @param {unknown} raw
 * @returns {UnknownRecord} A v1 DashboardDocument-shaped object.
 */
export const migrateDashboardDocument = (raw: unknown): UnknownRecord => {
  const doc = cloneRecord(raw);

  for (const key of ENVELOPE_KEYS) {
    delete doc[key];
  }

  // The pre-v1 top-level `version` was the producing app's version, not a schema
  // version. Preserve it as provenance under `generator`, then drop the field.
  if (typeof doc.version === "string") {
    const generator =
      doc.generator && typeof doc.generator === "object"
        ? (doc.generator as UnknownRecord)
        : ({} as UnknownRecord);
    if (generator.name === undefined) {
      generator.name = "freeboard";
    }
    if (generator.version === undefined) {
      generator.version = doc.version;
    }
    doc.generator = generator;
  }
  delete doc.version;

  doc.schemaVersion = DASHBOARD_DOCUMENT_SCHEMA_VERSION;

  if (Array.isArray(doc.panes)) {
    doc.panes = doc.panes.map((pane, index) => {
      const next =
        pane && typeof pane === "object" ? { ...(pane as UnknownRecord) } : ({} as UnknownRecord);
      const hasId = typeof next.id === "string" && next.id.length > 0;
      if (!hasId) {
        const layout =
          next.layout && typeof next.layout === "object"
            ? (next.layout as UnknownRecord)
            : undefined;
        const layoutId = layout && typeof layout.i === "string" ? layout.i : undefined;
        next.id = layoutId || `pane-${index}`;
      }
      return next;
    });
  }

  return doc;
};
