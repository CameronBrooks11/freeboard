/**
 * @module resolvers/CredentialProfile
 * GraphQL resolver implementations for credential profile management.
 */

import { createGraphQLError } from "graphql-yoga";
import type { IResolvers } from "@graphql-tools/utils";
import { ensureThatUserHasRole, ensureThatUserIsAdministrator } from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
  redactSecretShape,
} from "../credentialEncryption.js";
import type { EncryptedSecretPayload } from "../credentialEncryption.js";
import { dataStore } from "../data/index.js";

const { CREDENTIAL_PROFILE_TYPES } = dataStore.constants;
const credentialProfileRepository = dataStore.repositories.credentialProfiles;

const normalizeProfileType = (value: unknown): string => {
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

const normalizeMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const normalizeSecret = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const validateProfilePayload = ({
  type,
  metadata,
  secret,
}: {
  type: string;
  metadata: Record<string, unknown>;
  secret: Record<string, unknown>;
}) => {
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

const toCredentialProfileResponse = (profile: Record<string, unknown>) => {
  const decryptedSecret = (() => {
    try {
      return decryptCredentialSecret((profile.secret || null) as EncryptedSecretPayload | null);
    } catch {
      return {};
    }
  })();

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

const toDuplicateNameGraphQLError = (error: unknown) => {
  const typedError =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          keyPattern?: Record<string, unknown>;
          constraint?: unknown;
          detail?: unknown;
        })
      : null;
  if (Number(typedError?.code) === 11000 && typedError?.keyPattern?.name) {
    return createGraphQLError("Credential profile name must be unique", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  if (
    String(typedError?.code || "") === "23505" &&
    (String(typedError?.constraint || "").includes("credential_profiles_name") ||
      String(typedError?.detail || "").includes("(name)="))
  ) {
    return createGraphQLError("Credential profile name must be unique", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return null;
};

const resolvers: IResolvers = {
  CredentialProfileType: {
    NONE: "none",
    HEADER: "header",
    BEARER: "bearer",
    BASIC: "basic",
  },

  Query: {
    credentialProfiles: async (parent, args, context) => {
      ensureThatUserHasRole(context, ["editor", "admin"]);
      const profiles = await credentialProfileRepository.listSortedByName();
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

      let created;
      try {
        created = await credentialProfileRepository.create({
          name: String(input?.name || "").trim(),
          description: String(input?.description || "").trim(),
          type,
          allowPublicUse: Boolean(input?.allowPublicUse),
          metadata,
          secret: encryptCredentialSecret(secret),
          createdBy: context.user._id,
          updatedBy: context.user._id,
        });
      } catch (error) {
        const duplicateError = toDuplicateNameGraphQLError(error);
        if (duplicateError) {
          throw duplicateError;
        }
        throw error;
      }

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

      return toCredentialProfileResponse(created);
    },

    adminUpdateCredentialProfile: async (parent, { _id, input }, context) => {
      ensureThatUserIsAdministrator(context);

      const existing = await credentialProfileRepository.findById({ profileId: _id });
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
        nextSecret = decryptCredentialSecret(
          (existing.secret || null) as EncryptedSecretPayload | null,
        );
      } else {
        nextSecret = normalizeSecret(input.secret);
      }

      validateProfilePayload({
        type: nextType,
        metadata: nextMetadata,
        secret: nextSecret,
      });

      let updated;
      try {
        updated = await credentialProfileRepository.updateById({
          profileId: _id,
          patch: {
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
        });
      } catch (error) {
        const duplicateError = toDuplicateNameGraphQLError(error);
        if (duplicateError) {
          throw duplicateError;
        }
        throw error;
      }

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

      const deleted = await credentialProfileRepository.deleteById({
        profileId: _id,
      });
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

export default resolvers;
