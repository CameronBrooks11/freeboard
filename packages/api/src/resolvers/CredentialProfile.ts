/**
 * @module resolvers/CredentialProfile
 * @description GraphQL resolver implementations for credential profile management.
 */

import { createGraphQLError } from "graphql-yoga";
import { ensureThatUserHasRole, ensureThatUserIsAdministrator } from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
  redactSecretShape,
} from "../credentialEncryption.js";
import CredentialProfile, { CREDENTIAL_PROFILE_TYPES } from "../models/CredentialProfile.js";

const normalizeProfileType = (value) => {
  const normalized = String(value || "none")
    .trim()
    .toLowerCase();
  if (!CREDENTIAL_PROFILE_TYPES.includes(normalized)) {
    throw createGraphQLError("Invalid credential profile type", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return normalized;
};

const normalizeMetadata = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
};

const normalizeSecret = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
};

const validateProfilePayload = ({ type, metadata, secret }) => {
  if (type === "none") {
    return;
  }

  if (type === "bearer") {
    if (!String(secret?.token || "").trim()) {
      throw createGraphQLError("Bearer credential profile requires secret.token", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    return;
  }

  if (type === "basic") {
    if (!String(secret?.username || "")) {
      throw createGraphQLError("Basic credential profile requires secret.username", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    if (!String(secret?.password || "")) {
      throw createGraphQLError("Basic credential profile requires secret.password", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    return;
  }

  if (type === "header") {
    if (!String(metadata?.headerName || "").trim()) {
      throw createGraphQLError("Header credential profile requires metadata.headerName", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    if (!String(secret?.headerValue || "")) {
      throw createGraphQLError("Header credential profile requires secret.headerValue", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }
};

const toCredentialProfileResponse = (profile) => {
  let decryptedSecret = {};
  try {
    decryptedSecret = decryptCredentialSecret(profile.secret);
  } catch {
    decryptedSecret = {};
  }

  return {
    _id: profile._id,
    name: profile.name,
    description: profile.description || "",
    type: profile.type,
    allowPublicUse: profile.allowPublicUse === true,
    metadata: profile.metadata || {},
    secretShape: redactSecretShape(decryptedSecret),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

export default {
  CredentialProfileType: {
    NONE: "none",
    HEADER: "header",
    BEARER: "bearer",
    BASIC: "basic",
  },

  Query: {
    credentialProfiles: async (parent, args, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
      const profiles = await CredentialProfile.find({}).sort({ name: 1 }).lean();
      return profiles.map(toCredentialProfileResponse);
    },
  },

  Mutation: {
    adminCreateCredentialProfile: async (parent, { input }, context) => {
      ensureThatUserIsAdministrator(context);

      const type = normalizeProfileType(input?.type);
      const metadata = normalizeMetadata(input?.metadata);
      const secret = normalizeSecret(input?.secret);
      validateProfilePayload({
        type,
        metadata,
        secret,
      });

      const created = await new CredentialProfile({
        name: String(input?.name || "").trim(),
        description: String(input?.description || "").trim(),
        type,
        allowPublicUse: Boolean(input?.allowPublicUse),
        metadata,
        secret: encryptCredentialSecret(secret),
        createdBy: context.user._id,
        updatedBy: context.user._id,
      }).save();

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "credential_profile.created",
        targetType: "credential_profile",
        targetId: created._id,
        metadata: {
          type,
          allowPublicUse: created.allowPublicUse,
        },
      });

      return toCredentialProfileResponse(created.toObject());
    },

    adminUpdateCredentialProfile: async (parent, { _id, input }, context) => {
      ensureThatUserIsAdministrator(context);

      const existing = await CredentialProfile.findOne({ _id }).lean();
      if (!existing) {
        throw createGraphQLError("Credential profile not found");
      }

      const nextType = input?.type === undefined ? existing.type : normalizeProfileType(input.type);
      const nextMetadata =
        input?.metadata === undefined
          ? normalizeMetadata(existing.metadata)
          : normalizeMetadata(input.metadata);

      let nextSecret;
      if (input?.secret === undefined) {
        nextSecret = decryptCredentialSecret(existing.secret);
      } else {
        nextSecret = normalizeSecret(input.secret);
      }

      validateProfilePayload({
        type: nextType,
        metadata: nextMetadata,
        secret: nextSecret,
      });

      const updated = await CredentialProfile.findOneAndUpdate(
        { _id },
        {
          $set: {
            name: input?.name === undefined ? existing.name : String(input.name || "").trim(),
            description:
              input?.description === undefined
                ? existing.description
                : String(input.description || "").trim(),
            type: nextType,
            allowPublicUse:
              input?.allowPublicUse === undefined
                ? existing.allowPublicUse
                : Boolean(input.allowPublicUse),
            metadata: nextMetadata,
            secret: encryptCredentialSecret(nextSecret),
            updatedBy: context.user._id,
          },
        },
        { new: true, runValidators: true },
      ).lean();

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "credential_profile.updated",
        targetType: "credential_profile",
        targetId: _id,
        metadata: {
          type: nextType,
          allowPublicUse: updated?.allowPublicUse === true,
        },
      });

      if (!updated) {
        throw createGraphQLError("Credential profile not found");
      }

      return toCredentialProfileResponse(updated);
    },

    adminDeleteCredentialProfile: async (parent, { _id }, context) => {
      ensureThatUserIsAdministrator(context);

      const deleted = await CredentialProfile.findOneAndDelete({ _id }).lean();
      if (!deleted) {
        throw createGraphQLError("Credential profile not found");
      }

      await recordAuditEvent({
        actorUserId: context.user._id,
        action: "credential_profile.deleted",
        targetType: "credential_profile",
        targetId: _id,
      });

      return toCredentialProfileResponse(deleted);
    },
  },
};
