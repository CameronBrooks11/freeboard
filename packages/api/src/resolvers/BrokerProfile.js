/**
 * @module resolvers/BrokerProfile
 * @description GraphQL resolver implementations for broker profile management.
 */

import { URL } from "url";
import { createGraphQLError } from "graphql-yoga";
import {
  ensureThatUserHasRole,
  ensureThatUserIsAdministrator,
} from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import BrokerProfile, {
  BROKER_PROFILE_PROTOCOLS,
} from "../models/BrokerProfile.js";
import CredentialProfile from "../models/CredentialProfile.js";

const MQTT_ALLOWED_URL_PROTOCOLS = new Set(["mqtt:", "mqtts:"]);

const normalizeProtocol = (value) => {
  const normalized = String(value || "mqtt").trim().toLowerCase();
  if (!BROKER_PROFILE_PROTOCOLS.includes(normalized)) {
    throw createGraphQLError("Invalid broker profile protocol", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return normalized;
};

const normalizeName = (value) => String(value || "").trim();

const normalizeDescription = (value) => String(value || "").trim();

const normalizeBrokerUrl = (value, protocol) => {
  const raw = String(value || "").trim();
  if (!raw) {
    throw createGraphQLError("Broker URL is required", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw createGraphQLError("Broker URL is invalid", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!parsed.hostname) {
    throw createGraphQLError("Broker URL hostname is required", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (protocol === "mqtt" && !MQTT_ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    throw createGraphQLError("MQTT broker URL must use mqtt:// or mqtts://", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return parsed.toString();
};

const normalizeTls = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
};

const normalizeTopicAllowlist = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const topic = String(entry || "").trim();
    if (!topic || seen.has(topic)) {
      continue;
    }
    seen.add(topic);
    normalized.push(topic);
  }
  return normalized;
};

const normalizeCredentialProfileId = (value) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const ensureMqttCredentialProfile = async (credentialProfileId) => {
  if (!credentialProfileId) {
    return null;
  }

  const credentialProfile = await CredentialProfile.findOne({
    _id: credentialProfileId,
  })
    .select("_id type")
    .lean();
  if (!credentialProfile) {
    throw createGraphQLError("Credential profile not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  if (String(credentialProfile.type || "").toLowerCase() !== "basic") {
    throw createGraphQLError(
      "MQTT broker credentials must use a basic credential profile",
      {
        extensions: { code: "BAD_USER_INPUT" },
      }
    );
  }

  return String(credentialProfile._id);
};

const toBrokerProfileResponse = (profile) => ({
  _id: profile._id,
  name: profile.name,
  description: profile.description || "",
  protocol: profile.protocol,
  brokerUrl: profile.brokerUrl,
  tls: profile.tls || {},
  credentialProfileId: profile.credentialProfileId || null,
  allowPublicUse: profile.allowPublicUse === true,
  topicAllowlist: Array.isArray(profile.topicAllowlist) ? profile.topicAllowlist : [],
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

const toDuplicateNameGraphQLError = (error) => {
  if (Number(error?.code) === 11000 && error?.keyPattern?.name) {
    return createGraphQLError("Broker profile name must be unique", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return null;
};

export default {
  BrokerProfileProtocol: {
    MQTT: "mqtt",
  },

  Query: {
    brokerProfiles: async (_parent, { protocol }, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const normalizedProtocol = protocol ? normalizeProtocol(protocol) : null;
      const filter = normalizedProtocol ? { protocol: normalizedProtocol } : {};
      const profiles = await BrokerProfile.find(filter).sort({ name: 1 }).lean();
      return profiles.map(toBrokerProfileResponse);
    },
  },

  Mutation: {
    adminCreateBrokerProfile: async (_parent, { input }, context) => {
      ensureThatUserIsAdministrator(context);

      const protocol = normalizeProtocol(input?.protocol);
      const name = normalizeName(input?.name);
      if (!name) {
        throw createGraphQLError("Broker profile name is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const credentialProfileId = await ensureMqttCredentialProfile(
        normalizeCredentialProfileId(input?.credentialProfileId)
      );

      let created;
      try {
        created = await new BrokerProfile({
          name,
          description: normalizeDescription(input?.description),
          protocol,
          brokerUrl: normalizeBrokerUrl(input?.brokerUrl, protocol),
          tls: normalizeTls(input?.tls),
          credentialProfileId,
          allowPublicUse: Boolean(input?.allowPublicUse),
          topicAllowlist: normalizeTopicAllowlist(input?.topicAllowlist),
          createdBy: context.user._id,
          updatedBy: context.user._id,
        }).save();
      } catch (error) {
        const duplicateError = toDuplicateNameGraphQLError(error);
        if (duplicateError) {
          throw duplicateError;
        }
        throw error;
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "broker_profile.created",
        targetType: "broker_profile",
        targetId: created._id,
        metadata: {
          protocol,
          allowPublicUse: created.allowPublicUse === true,
        },
      });

      return toBrokerProfileResponse(created.toObject());
    },

    adminUpdateBrokerProfile: async (_parent, { _id, input }, context) => {
      ensureThatUserIsAdministrator(context);

      const existing = await BrokerProfile.findOne({ _id }).lean();
      if (!existing) {
        throw createGraphQLError("Broker profile not found");
      }

      const protocol =
        input?.protocol === undefined
          ? existing.protocol
          : normalizeProtocol(input.protocol);
      const name =
        input?.name === undefined
          ? existing.name
          : normalizeName(input.name);
      if (!name) {
        throw createGraphQLError("Broker profile name is required", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const credentialProfileId =
        input?.credentialProfileId === undefined
          ? normalizeCredentialProfileId(existing.credentialProfileId)
          : normalizeCredentialProfileId(input.credentialProfileId);
      const resolvedCredentialProfileId = await ensureMqttCredentialProfile(
        credentialProfileId
      );

      const updatePayload = {
        name,
        description:
          input?.description === undefined
            ? normalizeDescription(existing.description)
            : normalizeDescription(input.description),
        protocol,
        brokerUrl:
          input?.brokerUrl === undefined
            ? normalizeBrokerUrl(existing.brokerUrl, protocol)
            : normalizeBrokerUrl(input.brokerUrl, protocol),
        tls:
          input?.tls === undefined ? normalizeTls(existing.tls) : normalizeTls(input.tls),
        credentialProfileId: resolvedCredentialProfileId,
        allowPublicUse:
          input?.allowPublicUse === undefined
            ? Boolean(existing.allowPublicUse)
            : Boolean(input.allowPublicUse),
        topicAllowlist:
          input?.topicAllowlist === undefined
            ? normalizeTopicAllowlist(existing.topicAllowlist)
            : normalizeTopicAllowlist(input.topicAllowlist),
        updatedBy: context.user._id,
      };

      let updated;
      try {
        updated = await BrokerProfile.findOneAndUpdate(
          { _id },
          { $set: updatePayload },
          { new: true, runValidators: true }
        ).lean();
      } catch (error) {
        const duplicateError = toDuplicateNameGraphQLError(error);
        if (duplicateError) {
          throw duplicateError;
        }
        throw error;
      }

      if (!updated) {
        throw createGraphQLError("Broker profile not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "broker_profile.updated",
        targetType: "broker_profile",
        targetId: _id,
        metadata: {
          protocol,
          allowPublicUse: updated.allowPublicUse === true,
        },
      });

      return toBrokerProfileResponse(updated);
    },

    adminDeleteBrokerProfile: async (_parent, { _id }, context) => {
      ensureThatUserIsAdministrator(context);

      const deleted = await BrokerProfile.findOneAndDelete({ _id }).lean();
      if (!deleted) {
        throw createGraphQLError("Broker profile not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "broker_profile.deleted",
        targetType: "broker_profile",
        targetId: _id,
      });

      return toBrokerProfileResponse(deleted);
    },
  },
};
