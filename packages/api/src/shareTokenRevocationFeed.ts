/**
 * @module shareTokenRevocationFeed
 * Helper functions for recording and querying share-token revocation feed events.
 */

import { dataStore } from "./data/index.js";
import type { ShareTokenRevocationEventRecord } from "./data/contracts.js";

type CursorPayload = {
  createdAtMs: number;
  eventId: string;
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

const toEventPayload = (eventDoc: ShareTokenRevocationEventRecord) => ({
  eventId: String(eventDoc.eventId || ""),
  dashboardId: String(eventDoc.dashboardId || ""),
  shareTokenVersion: Math.max(0, Math.floor(Number(eventDoc.shareTokenVersion) || 0)),
  revokedAt: new Date(eventDoc.revokedAt || Date.now()).toISOString(),
});

const toCursorPayload = (eventDoc: ShareTokenRevocationEventRecord): CursorPayload => ({
  createdAtMs: new Date(eventDoc.createdAt || eventDoc.revokedAt || Date.now()).getTime(),
  eventId: String(eventDoc.eventId || ""),
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
  const repositoryReady = await Promise.resolve(dataStore.repositories.shareTokenRevocationFeed.isReady());
  if (!repositoryReady) {
    return;
  }

  try {
    await dataStore.repositories.shareTokenRevocationFeed.insertEvent({
      dashboardId: normalizedDashboardId,
      shareTokenVersion: normalizedVersion,
      revokedAt: new Date(revokedAt),
    });
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
  let cursorFilter: { createdAt: Date; eventId: string } | null = null;
  if (decodedCursor) {
    const cursorDate = new Date(decodedCursor.createdAtMs);
    if (cursorDate < retentionCutoff) {
      cursorExpired = true;
    } else {
      cursorFilter = {
        createdAt: cursorDate,
        eventId: decodedCursor.eventId,
      };
    }
  } else if (sinceCursor) {
    // Invalid cursor payload is treated as expired and forces consumer fallback path.
    cursorExpired = true;
  }

  const events = await dataStore.repositories.shareTokenRevocationFeed.queryEvents({
    retentionCutoff,
    cursor: cursorExpired ? null : cursorFilter,
    limit: safeLimit,
  });

  let nextCursor = null;
  if (events.length > 0) {
    const latestEvent = events[events.length - 1];
    if (latestEvent) {
      nextCursor = encodeCursor(toCursorPayload(latestEvent));
    }
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
