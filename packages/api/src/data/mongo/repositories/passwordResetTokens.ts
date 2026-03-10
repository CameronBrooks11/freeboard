import type PasswordResetToken from "../../../models/PasswordResetToken.js";
import type { PasswordResetTokenRecord, PasswordResetTokenRepository } from "../../contracts.js";

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
  userId?: unknown;
  tokenHash?: unknown;
  createdBy?: unknown;
  requestedByEmail?: unknown;
  revokedAt?: unknown;
  usedAt?: unknown;
  expiresAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): PasswordResetTokenRecord => ({
  _id: String(value._id || ""),
  userId: String(value.userId || ""),
  tokenHash: String(value.tokenHash || ""),
  createdBy: value.createdBy ? String(value.createdBy) : null,
  requestedByEmail: value.requestedByEmail ? String(value.requestedByEmail) : null,
  revokedAt: value.revokedAt ? toDate(value.revokedAt) : null,
  usedAt: value.usedAt ? toDate(value.usedAt) : null,
  expiresAt: toDate(value.expiresAt),
  createdAt: toDate(value.createdAt),
  updatedAt: toDate(value.updatedAt, toDate(value.createdAt)),
});

export const createMongoPasswordResetTokenRepository = (
  PasswordResetTokenModel: typeof PasswordResetToken,
): PasswordResetTokenRepository => ({
  findActiveByTokenHash: async ({ tokenHash, now }) => {
    const token = await PasswordResetTokenModel.findOne({
      tokenHash,
      revokedAt: null,
      usedAt: null,
      expiresAt: { $gt: now },
    }).lean();

    return token ? toRecord(token) : null;
  },

  revokeActiveByUserId: async ({ userId, now }) => {
    await PasswordResetTokenModel.updateMany(
      {
        userId,
        revokedAt: null,
        usedAt: null,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          revokedAt: now,
        },
      },
    );
  },

  create: async ({ userId, tokenHash, createdBy, requestedByEmail, expiresAt }) => {
    const created = await new PasswordResetTokenModel({
      userId,
      tokenHash,
      createdBy,
      requestedByEmail,
      expiresAt,
    }).save();

    const createdId =
      created && typeof created === "object" && "_id" in created ? (created._id as unknown) : null;
    const persisted = createdId
      ? await PasswordResetTokenModel.findOne({ _id: createdId }).lean()
      : null;
    if (persisted) {
      return toRecord(persisted);
    }

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject as Record<string, unknown>);
  },

  markUsedById: async ({ tokenId, usedAt }) => {
    await PasswordResetTokenModel.findOneAndUpdate(
      {
        _id: tokenId,
      },
      {
        $set: {
          usedAt,
        },
      },
      {
        new: false,
      },
    ).lean();
  },
});
