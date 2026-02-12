/**
 * @module resolvers/Policy
 * @description GraphQL resolver implementations for auth/registration policy controls.
 */

import { createGraphQLError } from "graphql-yoga";
import { ensureThatUserIsAdministrator } from "../auth.js";
import { config } from "../config.js";
import { recordAuditEvent } from "../audit.js";
import { getAuthPolicyState, setAuthPolicyState } from "../policyStore.js";

const toMutablePolicyInput = (args = {}) => {
  const input = {};
  if (args.registrationMode !== undefined) {
    input.registrationMode = args.registrationMode;
  }
  if (args.registrationDefaultRole !== undefined) {
    input.registrationDefaultRole = args.registrationDefaultRole;
  }
  if (args.editorCanPublish !== undefined) {
    input.editorCanPublish = Boolean(args.editorCanPublish);
  }
  if (args.dashboardDefaultVisibility !== undefined) {
    input.dashboardDefaultVisibility = args.dashboardDefaultVisibility;
  }
  if (args.dashboardPublicListingEnabled !== undefined) {
    input.dashboardPublicListingEnabled = Boolean(
      args.dashboardPublicListingEnabled
    );
  }
  if (args.executionMode !== undefined) {
    input.executionMode = args.executionMode;
  }
  return input;
};

export default {
  UserRole: {
    VIEWER: "viewer",
    EDITOR: "editor",
    ADMIN: "admin",
  },
  RegistrationMode: {
    DISABLED: "disabled",
    INVITE: "invite",
    OPEN: "open",
  },
  ExecutionMode: {
    SAFE: "safe",
    TRUSTED: "trusted",
  },
  DashboardVisibility: {
    PRIVATE: "private",
    LINK: "link",
    PUBLIC: "public",
  },
  Query: {
    publicAuthPolicy: async () => getAuthPolicyState(),
    authPolicy: async (parent, args, context) => {
      ensureThatUserIsAdministrator(context);
      return getAuthPolicyState();
    },
  },
  Mutation: {
    setAuthPolicy: async (parent, args, context) => {
      ensureThatUserIsAdministrator(context);

      if (config.policyEditLock) {
        throw createGraphQLError(
          "Auth policy is locked by environment configuration",
          {
            extensions: { code: "FORBIDDEN" },
          }
        );
      }

      const policyInput = toMutablePolicyInput(args);
      if (Object.keys(policyInput).length === 0) {
        return getAuthPolicyState();
      }

      const policy = await setAuthPolicyState(policyInput, context.user?._id);
      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "auth.policy.updated",
        targetType: "policy",
        targetId: "auth",
        metadata: policyInput,
      });
      return policy;
    },
  },
};
