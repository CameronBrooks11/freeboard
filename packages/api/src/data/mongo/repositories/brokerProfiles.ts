import type BrokerProfile from "../../../models/BrokerProfile.js";
import type { BrokerProfileRecord, BrokerProfileRepository } from "../../contracts.js";

const normalizeTopicAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
};

const toRecord = (value: {
  _id?: unknown;
  name?: unknown;
  description?: unknown;
  protocol?: unknown;
  brokerUrl?: unknown;
  tls?: unknown;
  credentialProfileId?: unknown;
  allowPublicUse?: unknown;
  topicAllowlist?: unknown;
  createdBy?: unknown;
  updatedBy?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}): BrokerProfileRecord => ({
  _id: String(value._id || ""),
  name: String(value.name || ""),
  description: String(value.description || ""),
  protocol: String(value.protocol || "mqtt"),
  brokerUrl: String(value.brokerUrl || ""),
  tls: value.tls && typeof value.tls === "object" && !Array.isArray(value.tls) ? value.tls : {},
  credentialProfileId: value.credentialProfileId ? String(value.credentialProfileId) : null,
  allowPublicUse: value.allowPublicUse === true,
  topicAllowlist: normalizeTopicAllowlist(value.topicAllowlist),
  createdBy: value.createdBy ? String(value.createdBy) : null,
  updatedBy: value.updatedBy ? String(value.updatedBy) : null,
  createdAt: new Date(value.createdAt || Date.now()),
  updatedAt: new Date(value.updatedAt || Date.now()),
});

export const createMongoBrokerProfileRepository = (
  BrokerProfileModel: typeof BrokerProfile,
): BrokerProfileRepository => ({
  listSortedByName: async ({ protocol = null }) => {
    const filter = protocol
      ? {
          protocol,
        }
      : {};

    const profiles = await BrokerProfileModel.find(filter).sort({ name: 1 }).lean();
    return profiles.map((profile) => toRecord(profile));
  },

  findById: async ({ profileId }) => {
    const profile = await BrokerProfileModel.findOne({ _id: profileId }).lean();
    return profile ? toRecord(profile) : null;
  },

  findByIds: async ({ profileIds }) => {
    const normalizedIds = profileIds.map((entry) => String(entry || "").trim()).filter(Boolean);
    if (!normalizedIds.length) {
      return [];
    }

    const profiles = await BrokerProfileModel.find({
      _id: { $in: normalizedIds },
    })
      .select("_id credentialProfileId")
      .lean();
    return profiles.map((profile) => toRecord(profile));
  },

  create: async ({
    name,
    description,
    protocol,
    brokerUrl,
    tls,
    credentialProfileId,
    allowPublicUse,
    topicAllowlist,
    createdBy,
    updatedBy,
  }) => {
    const created = await new BrokerProfileModel({
      name,
      description,
      protocol,
      brokerUrl,
      tls,
      credentialProfileId,
      allowPublicUse,
      topicAllowlist,
      createdBy,
      updatedBy,
    }).save();
    const asObject = typeof created.toObject === "function" ? created.toObject() : created;
    return toRecord(asObject);
  },

  updateById: async ({ profileId, patch }) => {
    const updated = await BrokerProfileModel.findOneAndUpdate(
      { _id: profileId },
      {
        $set: patch,
      },
      {
        new: true,
        runValidators: true,
      },
    ).lean();
    return updated ? toRecord(updated) : null;
  },

  deleteById: async ({ profileId }) => {
    const deleted = await BrokerProfileModel.findOneAndDelete({ _id: profileId }).lean();
    return deleted ? toRecord(deleted) : null;
  },
});
