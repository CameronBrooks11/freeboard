import mongoose from "mongoose";
import type ShareTokenRevocationEvent from "../../../models/ShareTokenRevocationEvent.js";
import type {
  ShareTokenRevocationEventRecord,
  ShareTokenRevocationRepository,
} from "../../contracts.js";

const toValidDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const normalized = new Date(value as Date | string | number);
  if (!Number.isFinite(normalized.getTime())) {
    return fallback;
  }
  return normalized;
};

const toRecord = (eventDoc: {
  _id: unknown;
  dashboardId?: unknown;
  shareTokenVersion?: unknown;
  revokedAt?: unknown;
  createdAt?: unknown;
}): ShareTokenRevocationEventRecord => ({
  eventId: String(eventDoc._id || ""),
  dashboardId: String(eventDoc.dashboardId || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(eventDoc.shareTokenVersion) || 0)),
  revokedAt: toValidDate(eventDoc.revokedAt),
  createdAt: toValidDate(eventDoc.createdAt, toValidDate(eventDoc.revokedAt)),
});

export const createMongoShareTokenRevocationRepository = (
  ShareTokenRevocationEventModel: typeof ShareTokenRevocationEvent,
): ShareTokenRevocationRepository => ({
  isReady: () => ShareTokenRevocationEventModel?.db?.readyState === 1,

  insertEvent: async ({ dashboardId, shareTokenVersion, revokedAt }) => {
    await new ShareTokenRevocationEventModel({
      dashboardId,
      shareTokenVersion,
      revokedAt,
    }).save();
  },

  queryEvents: async ({ retentionCutoff, cursor, limit }) => {
    let cursorFilter: Record<string, unknown> = {};
    if (cursor) {
      const cursorObjectId = mongoose.Types.ObjectId.isValid(cursor.eventId)
        ? new mongoose.Types.ObjectId(cursor.eventId)
        : null;
      cursorFilter = cursorObjectId
        ? {
            $or: [
              { createdAt: { $gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, _id: { $gt: cursorObjectId } },
            ],
          }
        : {
            createdAt: { $gt: cursor.createdAt },
          };
    }

    const events = await ShareTokenRevocationEventModel.find({
      revokedAt: { $gte: retentionCutoff },
      ...cursorFilter,
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean();

    return events.map(toRecord);
  },
});
