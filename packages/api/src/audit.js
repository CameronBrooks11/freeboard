/**
 * @module audit
 * @description Small helper for persisting non-blocking audit events.
 */

import mongoose from "mongoose";
import AuditEvent from "./models/AuditEvent.js";

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
}) => {
  if (!action) {
    return;
  }

  const readyState = AuditEvent?.db?.readyState ?? mongoose.connection?.readyState;
  if (readyState !== 1) {
    return;
  }

  try {
    await new AuditEvent({
      actorUserId,
      action,
      targetType,
      targetId,
      metadata,
    }).save();
  } catch (error) {
    console.warn("Audit event persistence failed", error?.message || error);
  }
};
