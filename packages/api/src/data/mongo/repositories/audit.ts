import type AuditEvent from "../../../models/AuditEvent.js";
import type { AuditEventRecord, AuditRepository } from "../../contracts.js";

const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const normalized = new Date(value as Date | string | number);
  if (!Number.isFinite(normalized.getTime())) {
    return fallback;
  }
  return normalized;
};

const toRecord = (value: {
  _id?: unknown;
  actorUserId?: unknown;
  action?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  metadata?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): AuditEventRecord => ({
  _id: String(value._id || ""),
  actorUserId: value.actorUserId ? String(value.actorUserId) : null,
  action: String(value.action || ""),
  targetType: value.targetType ? String(value.targetType) : null,
  targetId: value.targetId ? String(value.targetId) : null,
  metadata:
    value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? (value.metadata as Record<string, unknown>)
      : {},
  createdAt: toDate(value.createdAt),
  updatedAt: toDate(value.updatedAt, toDate(value.createdAt)),
});

export const createMongoAuditRepository = (
  AuditEventModel: typeof AuditEvent,
): AuditRepository => ({
  isReady: () => AuditEventModel?.db?.readyState === 1,

  insertEvent: async ({
    actorUserId = null,
    action,
    targetType = null,
    targetId = null,
    metadata = {},
  }) => {
    await new AuditEventModel({
      actorUserId,
      action,
      targetType,
      targetId,
      metadata,
    }).save();
  },

  queryEvents: async ({ actionPrefix = "", limit }) => {
    const normalizedPrefix = String(actionPrefix || "").trim();
    const query: Record<string, unknown> = {};
    if (normalizedPrefix) {
      query.action = { $regex: `^${normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
    }

    const events = await AuditEventModel.find(query)
      .sort({ createdAt: "desc" })
      .limit(Math.max(1, Math.floor(Number(limit) || 1)))
      .lean();

    return events.map((event) => toRecord(event));
  },
});
