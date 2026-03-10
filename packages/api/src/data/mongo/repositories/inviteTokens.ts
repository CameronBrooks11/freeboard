import type InviteToken from "../../../models/InviteToken.js";
import type { InviteTokenRecord, InviteTokenRepository } from "../../contracts.js";

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
  email?: unknown;
  role?: unknown;
  tokenHash?: unknown;
  createdBy?: unknown;
  revokedAt?: unknown;
  acceptedAt?: unknown;
  acceptedUserId?: unknown;
  expiresAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): InviteTokenRecord => ({
  _id: String(value._id || ""),
  email: String(value.email || ""),
  role: String(value.role || "viewer"),
  tokenHash: String(value.tokenHash || ""),
  createdBy: value.createdBy ? String(value.createdBy) : null,
  revokedAt: value.revokedAt ? toDate(value.revokedAt) : null,
  acceptedAt: value.acceptedAt ? toDate(value.acceptedAt) : null,
  acceptedUserId: value.acceptedUserId ? String(value.acceptedUserId) : null,
  expiresAt: toDate(value.expiresAt),
  createdAt: toDate(value.createdAt),
  updatedAt: toDate(value.updatedAt, toDate(value.createdAt)),
});

export const createMongoInviteTokenRepository = (
  InviteTokenModel: typeof InviteToken,
): InviteTokenRepository => ({
  listPending: async ({ now }) => {
    const invites = await InviteTokenModel.find({
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: "desc" })
      .lean();

    return invites.map((invite) => toRecord(invite));
  },

  findActiveByTokenHash: async ({ tokenHash, now }) => {
    const invite = await InviteTokenModel.findOne({
      tokenHash,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { $gt: now },
    }).lean();

    return invite ? toRecord(invite) : null;
  },

  revokePendingByEmail: async ({ email, now }) => {
    await InviteTokenModel.updateMany(
      {
        email,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          revokedAt: now,
        },
      },
    );
  },

  create: async ({ email, role, tokenHash, createdBy, expiresAt }) => {
    const created = await new InviteTokenModel({
      email,
      role,
      tokenHash,
      createdBy,
      expiresAt,
    }).save();

    const createdId =
      created && typeof created === "object" && "_id" in created ? (created._id as unknown) : null;
    const persisted = createdId ? await InviteTokenModel.findOne({ _id: createdId }).lean() : null;
    if (persisted) {
      return toRecord(persisted);
    }

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject as Record<string, unknown>);
  },

  markAcceptedById: async ({ inviteId, acceptedAt, acceptedUserId }) => {
    await InviteTokenModel.findOneAndUpdate(
      { _id: inviteId },
      {
        $set: {
          acceptedAt,
          acceptedUserId,
        },
      },
      {
        new: false,
      },
    ).lean();
  },

  revokePendingById: async ({ inviteId, now }) => {
    const updated = await InviteTokenModel.findOneAndUpdate(
      {
        _id: inviteId,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          revokedAt: now,
        },
      },
      {
        new: true,
      },
    ).lean();

    return updated ? toRecord(updated) : null;
  },
});
