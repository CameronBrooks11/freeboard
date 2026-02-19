/**
 * @module shareTokenRevocationFeed
 * @description Helper functions for recording and querying share-token revocation feed events.
 */

import mongoose from "mongoose";
import ShareTokenRevocationEvent from "./models/ShareTokenRevocationEvent.js";

type CursorPayload = {
  createdAtMs: number;
  eventId: string;
};

type FeedEventLike = {
  _id: unknown;
  dashboardId?: unknown;
  shareTokenVersion?: unknown;
  revokedAt?: Date | string | number;
  createdAt?: Date | string | number;
};

const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

const decodeCursor = (cursor: unknown): CursorPayload | null => {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    const createdAtMs = Number(parsed?.createdAtMs);
    const eventId = String(parsed?.eventId || "").trim();
    if (!Number.isFinite(createdAtMs) || !eventId) {
      return null;
    }
    return { createdAtMs, eventId };
  } catch {
    return null;
  }
};

const toEventPayload = (eventDoc: FeedEventLike) => ({
  eventId: String(eventDoc._id),
  dashboardId: String(eventDoc.dashboardId || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(eventDoc.shareTokenVersion) || 0)),
  revokedAt:
    eventDoc.revokedAt instanceof Date
      ? eventDoc.revokedAt.toISOString()
      : new Date(eventDoc.revokedAt || Date.now()).toISOString(),
});

const toCursorPayload = (eventDoc: FeedEventLike): CursorPayload => ({
  createdAtMs: new Date(eventDoc.createdAt || eventDoc.revokedAt || Date.now()).getTime(),
  eventId: String(eventDoc._id),
});

/**
 * Record one share-token revocation event for gateway feed polling.
 *
 * @param {Object} params
 * @returns {Promise<void>}
 */
export const recordShareTokenRevocationEvent = async ({
  dashboardId,
  shareTokenVersion,
  revokedAt = new Date(),
}: {
  dashboardId: unknown;
  shareTokenVersion: unknown;
  revokedAt?: Date | string | number;
}) => {
  const normalizedDashboardId = String(dashboardId || "").trim();
  if (!normalizedDashboardId) {
    return;
  }

  const normalizedVersion = Math.max(0, Math.floor(Number(shareTokenVersion) || 0));
  const readyState = ShareTokenRevocationEvent?.db?.readyState ?? mongoose.connection?.readyState;
  if (readyState !== 1) {
    return;
  }

  try {
    await new ShareTokenRevocationEvent({
      dashboardId: normalizedDashboardId,
      shareTokenVersion: normalizedVersion,
      revokedAt: new Date(revokedAt),
    }).save();
  } catch (error) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message?: string }).message
        : undefined;
    console.warn("Share token revocation event persistence failed", errorMessage || error);
  }
};

/**
 * Query revocation feed using cursor-based pagination with retention window.
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export const queryShareTokenRevocationFeed = async ({
  sinceCursor = null,
  limit = 200,
  retentionSeconds = 86_400,
}: {
  sinceCursor?: string | null;
  limit?: number;
  retentionSeconds?: number;
} = {}) => {
  const safeLimit = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 200)));
  const safeRetentionSeconds = Math.max(60, Math.floor(Number(retentionSeconds) || 86_400));
  const retentionCutoff = new Date(Date.now() - safeRetentionSeconds * 1000);
  const decodedCursor = decodeCursor(sinceCursor);

  let cursorExpired = false;
  let cursorFilter = {};
  if (decodedCursor) {
    const cursorDate = new Date(decodedCursor.createdAtMs);
    if (cursorDate < retentionCutoff) {
      cursorExpired = true;
    } else {
      const cursorObjectId = mongoose.Types.ObjectId.isValid(decodedCursor.eventId)
        ? new mongoose.Types.ObjectId(decodedCursor.eventId)
        : null;
      cursorFilter = cursorObjectId
        ? {
            $or: [
              { createdAt: { $gt: cursorDate } },
              { createdAt: cursorDate, _id: { $gt: cursorObjectId } },
            ],
          }
        : {
            createdAt: { $gt: cursorDate },
          };
    }
  } else if (sinceCursor) {
    // Invalid cursor payload is treated as expired and forces consumer fallback path.
    cursorExpired = true;
  }

  const events = await ShareTokenRevocationEvent.find({
    revokedAt: { $gte: retentionCutoff },
    ...(cursorExpired ? {} : cursorFilter),
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(safeLimit)
    .lean();

  let nextCursor = null;
  if (events.length > 0) {
    nextCursor = encodeCursor(toCursorPayload(events[events.length - 1]));
  } else if (decodedCursor && !cursorExpired) {
    nextCursor = encodeCursor({
      createdAtMs: decodedCursor.createdAtMs,
      eventId: decodedCursor.eventId,
    });
  } else {
    // Seed cursor at "now" to prevent replaying all retained events for brand-new consumers.
    nextCursor = encodeCursor({
      createdAtMs: Date.now(),
      eventId: "bootstrap",
    });
  }

  return {
    events: events.map(toEventPayload),
    nextCursor,
    cursorExpired,
  };
};
