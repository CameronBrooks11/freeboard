import type CredentialProfile from "../../../models/CredentialProfile.js";
import type { CredentialProfileRecord, CredentialProfileRepository } from "../../contracts.js";

const toRecord = (value: {
  _id?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  allowPublicUse?: unknown;
  metadata?: unknown;
  secret?: unknown;
  createdBy?: unknown;
  updatedBy?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): CredentialProfileRecord => ({
  _id: String(value._id || ""),
  name: String(value.name || ""),
  description: String(value.description || ""),
  type: String(value.type || "none"),
  allowPublicUse: value.allowPublicUse === true,
  metadata:
    value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? (value.metadata as Record<string, unknown>)
      : {},
  secret:
    value.secret && typeof value.secret === "object" && !Array.isArray(value.secret)
      ? (value.secret as Record<string, unknown>)
      : {},
  createdBy: value.createdBy ? String(value.createdBy) : null,
  updatedBy: value.updatedBy ? String(value.updatedBy) : null,
  createdAt: new Date(value.createdAt || Date.now()),
  updatedAt: new Date(value.updatedAt || Date.now()),
});

export const createMongoCredentialProfileRepository = (
  CredentialProfileModel: typeof CredentialProfile,
): CredentialProfileRepository => ({
  listSortedByName: async () => {
    const profiles = await CredentialProfileModel.find({}).sort({ name: 1 }).lean();
    return profiles.map((profile) => toRecord(profile));
  },

  findById: async ({ profileId }) => {
    const profile = await CredentialProfileModel.findOne({ _id: profileId })
      .select(
        "_id name description type allowPublicUse metadata secret createdBy updatedBy createdAt updatedAt",
      )
      .lean();
    return profile ? toRecord(profile) : null;
  },

  create: async ({
    name,
    description,
    type,
    allowPublicUse,
    metadata,
    secret,
    createdBy,
    updatedBy,
  }) => {
    const created = await new CredentialProfileModel({
      name,
      description,
      type,
      allowPublicUse,
      metadata,
      secret,
      createdBy,
      updatedBy,
    }).save();

    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject);
  },

  updateById: async ({ profileId, patch }) => {
    const updated = await CredentialProfileModel.findOneAndUpdate(
      { _id: profileId },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean();
    return updated ? toRecord(updated) : null;
  },

  deleteById: async ({ profileId }) => {
    const deleted = await CredentialProfileModel.findOneAndDelete({ _id: profileId }).lean();
    return deleted ? toRecord(deleted) : null;
  },
});
