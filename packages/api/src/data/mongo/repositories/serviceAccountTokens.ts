import type ServiceAccountToken from "../../../models/ServiceAccountToken.js";
import type { ServiceAccountTokenRecord, ServiceAccountTokenRepository } from "../../contracts.js";

const toRecord = (value: {
  _id?: unknown;
  serviceAccountId?: unknown;
  label?: unknown;
  scopes?: unknown;
  tokenHash?: unknown;
  tokenPrefix?: unknown;
  expiresAt?: unknown;
  revokedAt?: unknown;
  createdByUserId?: unknown;
  lastUsedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): ServiceAccountTokenRecord => ({
  _id: String(value._id || ""),
  serviceAccountId: String(value.serviceAccountId || ""),
  label: value.label ? String(value.label) : null,
  scopes: Array.isArray(value.scopes)
    ? value.scopes.map((scope) => String(scope || "").trim()).filter(Boolean)
    : [],
  tokenHash: String(value.tokenHash || ""),
  tokenPrefix: String(value.tokenPrefix || ""),
  expiresAt: value.expiresAt ? new Date(value.expiresAt as Date | string | number) : null,
  revokedAt: value.revokedAt ? new Date(value.revokedAt as Date | string | number) : null,
  createdByUserId: value.createdByUserId ? String(value.createdByUserId) : null,
  lastUsedAt: value.lastUsedAt ? new Date(value.lastUsedAt as Date | string | number) : null,
  createdAt: new Date(value.createdAt || Date.now()),
  updatedAt: new Date(value.updatedAt || Date.now()),
});

export const createMongoServiceAccountTokenRepository = (
  ServiceAccountTokenModel: typeof ServiceAccountToken,
): ServiceAccountTokenRepository => ({
  listActive: async () => {
    const now = new Date();
    const tokens = await ServiceAccountTokenModel.find({
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean();
    return tokens.map((token) => toRecord(token));
  },

  listByServiceAccountIdSortedByCreatedAtDesc: async ({ serviceAccountId }) => {
    const tokens = await ServiceAccountTokenModel.find({ serviceAccountId })
      .sort({ createdAt: "desc" })
      .lean();
    return tokens.map((token) => toRecord(token));
  },

  findById: async ({ tokenId }) => {
    const token = await ServiceAccountTokenModel.findOne({ _id: tokenId }).lean();
    return token ? toRecord(token) : null;
  },

  create: async ({
    serviceAccountId,
    label,
    scopes,
    tokenHash,
    tokenPrefix,
    expiresAt,
    createdByUserId,
  }) => {
    const created = await new ServiceAccountTokenModel({
      serviceAccountId,
      label,
      scopes,
      tokenHash,
      tokenPrefix,
      expiresAt,
      createdByUserId,
    }).save();

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject);
  },

  touchLastUsed: async ({ tokenId, lastUsedAt }) => {
    await ServiceAccountTokenModel.updateOne(
      { _id: tokenId },
      {
        $set: {
          lastUsedAt,
        },
      },
    );
  },

  countActiveByServiceAccountId: async ({ serviceAccountId }) =>
    ServiceAccountTokenModel.countDocuments({
      serviceAccountId,
      revokedAt: null,
    }),

  revokeById: async ({ tokenId, revokedAt }) => {
    const revoked = await ServiceAccountTokenModel.findOneAndUpdate(
      {
        _id: tokenId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt,
        },
      },
      {
        new: true,
      },
    ).lean();
    return revoked ? toRecord(revoked) : null;
  },

  revokeActiveByServiceAccountId: async ({ serviceAccountId, revokedAt }) => {
    await ServiceAccountTokenModel.updateMany(
      {
        serviceAccountId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt,
        },
      },
    );
  },
});
