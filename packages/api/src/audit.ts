/**
 * @module audit
 * Small helper for persisting non-blocking audit events.
 */

import { recordAuditWriteFailureMetric } from "./runtimeMetrics.js";
import { dataStore } from "./data/index.js";

type AuditEventInput = {
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Persist an audit event. Errors are intentionally non-fatal.
 *
 * @param {Object} event
 * @param {string|null} [event.actorUserId]
 * @param {string} event.action
 * @param {string|null} [event.targetType]
 * @param {string|null} [event.targetId]
 * @param {Object} [event.metadata]
 * @returns {Promise<void>}
 */
export const recordAuditEvent = async ({
  actorUserId = null,
  action,
  targetType = null,
  targetId = null,
  metadata = {},
}: AuditEventInput): Promise<void> => {
  if (!action) {
    return;
  }

  const repositoryReady = await Promise.resolve(dataStore.repositories.audit.isReady());
  if (!repositoryReady) {
    return;
  }

  try {
    await dataStore.repositories.audit.insertEvent({
      actorUserId,
      action,
      targetType,
      targetId,
      metadata,
    });
  } catch (error) {
    recordAuditWriteFailureMetric();
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message?: string }).message
        : undefined;
    console.warn("Audit event persistence failed", errorMessage || error);
  }
};
