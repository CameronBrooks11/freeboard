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
  "documentRevision",
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
 * Normalize a raw dashboard payload into a v1 DashboardDocument. Pure,
 * non-mutating, and idempotent on documents that are already current.
 *
 * - strips server-owned envelope fields,
 * - drops any stray top-level `version` (provenance lives in `generator`),
 * - stamps `schemaVersion`,
 * - ensures every pane carries a stable `id` (mirrors the grid `layout.i`).
 *
 * `migrate` only normalizes shape; structural/semantic validation is layered on
 * top. The producer (`Dashboard.toDocument`) emits `generator` directly, so there
 * is no legacy `version`→`generator` upgrade — a stray top-level `version` is just
 * dropped.
 *
 * @param {unknown} raw
 * @returns {UnknownRecord} A v1 DashboardDocument-shaped object.
 */
export const migrateDashboardDocument = (raw: unknown): UnknownRecord => {
  const doc = cloneRecord(raw);

  for (const key of ENVELOPE_KEYS) {
    delete doc[key];
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
