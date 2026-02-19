/**
 * @module resolvers/ServiceAccount
 * @description Admin service-account lifecycle + operational telemetry resolvers.
 */

import { createGraphQLError } from "graphql-yoga";
import type { IResolvers } from "@graphql-tools/utils";
import { ensureThatPrincipalHasServiceScope, ensureThatUserIsAdministrator } from "../auth.js";
import { recordAuditEvent } from "../audit.js";
import { config } from "../config.js";
import AuditEvent from "../models/AuditEvent.js";
import ServiceAccount from "../models/ServiceAccount.js";
import ServiceAccountToken from "../models/ServiceAccountToken.js";
import { getApiRuntimeMetricsSnapshot } from "../runtimeMetrics.js";
import { issueServiceAccountToken, normalizeServiceAccountScopes } from "../serviceAccountAuth.js";

const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 500;
const GATEWAY_RUNTIME_METRICS_URL = `${String(
  process.env.GATEWAY_RUNTIME_METRICS_URL ||
    process.env.FREEBOARD_GATEWAY_RUNTIME_METRICS_URL ||
    "http://127.0.0.1:8001/internal/metrics",
).replace(/\/$/, "")}`;
const GATEWAY_RUNTIME_METRICS_TIMEOUT_MS = Math.max(
  500,
  Math.floor(Number(process.env.GATEWAY_RUNTIME_METRICS_TIMEOUT_MS) || 2500),
);

const SCOPE_ENUM_MAP = Object.freeze({
  DATASOURCE_MINT: "datasource:mint",
  DATASOURCE_DIAGNOSTICS_READ: "datasource:diagnostics:read",
  OPS_READ: "ops:read",
});

const toComparableId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const toScopeValues = (scopes: unknown[] = []): string[] =>
  normalizeServiceAccountScopes(
    Array.isArray(scopes)
      ? scopes.map((scope) => {
          const normalized = String(scope || "")
            .trim()
            .toUpperCase();
          return (
            SCOPE_ENUM_MAP[normalized as keyof typeof SCOPE_ENUM_MAP] ||
            String(scope || "")
              .trim()
              .toLowerCase()
          );
        })
      : [],
  );

const toScopeEnums = (scopes: unknown[] = []): string[] =>
  normalizeServiceAccountScopes(scopes).map(
    (scope) =>
      Object.entries(SCOPE_ENUM_MAP).find(([, value]) => value === scope)?.[0] || "OPS_READ",
  );

const toTokenRecordView = (tokenRecord: Record<string, unknown>) => ({
  _id: tokenRecord._id,
  serviceAccountId: tokenRecord.serviceAccountId,
  label: tokenRecord.label || null,
  scopes: toScopeEnums(Array.isArray(tokenRecord.scopes) ? tokenRecord.scopes : []),
  tokenPreview: `fsa_${tokenRecord._id}.${String(tokenRecord.tokenPrefix || "").trim()}...`,
  expiresAt: tokenRecord.expiresAt || null,
  revokedAt: tokenRecord.revokedAt || null,
  createdAt: tokenRecord.createdAt || null,
  updatedAt: tokenRecord.updatedAt || null,
  lastUsedAt: tokenRecord.lastUsedAt || null,
});

const toServiceAccountView = (account: Record<string, unknown>, tokenCount = 0) => ({
  _id: account._id,
  name: account.name,
  description: account.description || "",
  active: account.active !== false,
  scopes: toScopeEnums(Array.isArray(account.scopes) ? account.scopes : []),
  tokenCount,
  createdAt: account.createdAt || null,
  updatedAt: account.updatedAt || null,
  lastUsedAt: account.lastUsedAt || null,
});

const ensureServiceAccountInputValid = ({
  name,
  scopes,
}: {
  name?: unknown;
  scopes?: unknown[];
}) => {
  const normalizedName = String(name || "").trim();
  if (!normalizedName || normalizedName.length < 3) {
    throw createGraphQLError("Service account name must be at least 3 characters", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const normalizedScopes = toScopeValues(scopes);
  if (!normalizedScopes.length) {
    throw createGraphQLError("At least one service account scope is required", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return {
    normalizedName,
    normalizedScopes,
  };
};

const clampAuditLimit = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUDIT_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(parsed), MAX_AUDIT_LIMIT));
};

const fetchGatewayMetrics = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_RUNTIME_METRICS_TIMEOUT_MS);
  try {
    const response = await fetch(GATEWAY_RUNTIME_METRICS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.gatewayServiceToken}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const resolvers: IResolvers = {
  ServiceAccountScope: {
    DATASOURCE_MINT: "DATASOURCE_MINT",
    DATASOURCE_DIAGNOSTICS_READ: "DATASOURCE_DIAGNOSTICS_READ",
    OPS_READ: "OPS_READ",
  },
  Query: {
    adminServiceAccounts: async (parent, args, context) => {
      ensureThatUserIsAdministrator(context);
      const [accounts, activeTokens] = await Promise.all([
        ServiceAccount.find({}).sort({ createdAt: "desc" }).lean(),
        ServiceAccountToken.find({
          revokedAt: null,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        })
          .select("_id serviceAccountId")
          .lean(),
      ]);

      const tokenCountByAccount = new Map();
      activeTokens.forEach((token) => {
        const serviceAccountId = toComparableId(token.serviceAccountId);
        if (!serviceAccountId) {
          return;
        }
        tokenCountByAccount.set(
          serviceAccountId,
          (tokenCountByAccount.get(serviceAccountId) || 0) + 1,
        );
      });

      return accounts.map((account) =>
        toServiceAccountView(account, tokenCountByAccount.get(toComparableId(account._id)) || 0),
      );
    },

    adminServiceAccountTokens: async (parent, { serviceAccountId }, context) => {
      ensureThatUserIsAdministrator(context);
      const normalizedAccountId = toComparableId(serviceAccountId);
      const account = await ServiceAccount.findOne({ _id: normalizedAccountId }).lean();
      if (!account) {
        throw createGraphQLError("Service account not found");
      }
      const tokens = await ServiceAccountToken.find({ serviceAccountId: normalizedAccountId })
        .sort({ createdAt: "desc" })
        .lean();
      return tokens.map(toTokenRecordView);
    },

    adminAuditEvents: async (
      parent,
      { limit = DEFAULT_AUDIT_LIMIT, actionPrefix = "" },
      context,
    ) => {
      ensureThatUserIsAdministrator(context);
      const query: Record<string, unknown> = {};
      const prefix = String(actionPrefix || "").trim();
      if (prefix) {
        query.action = { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
      }
      return AuditEvent.find(query)
        .sort({ createdAt: "desc" })
        .limit(clampAuditLimit(limit))
        .lean();
    },

    adminRuntimeMetrics: async (parent, args, context) => {
      ensureThatPrincipalHasServiceScope(context, ["ops:read"]);
      const [apiMetrics, gatewayMetrics] = await Promise.all([
        getApiRuntimeMetricsSnapshot(),
        fetchGatewayMetrics(),
      ]);
      return {
        collectedAt: new Date().toISOString(),
        api: apiMetrics,
        gateway: gatewayMetrics,
      };
    },
  },

  Mutation: {
    adminCreateServiceAccount: async (parent, { input }, context) => {
      ensureThatUserIsAdministrator(context);
      const { normalizedName, normalizedScopes } = ensureServiceAccountInputValid({
        name: input?.name,
        scopes: input?.scopes,
      });

      const account = await new ServiceAccount({
        name: normalizedName,
        description: String(input?.description || "").trim(),
        active: input?.active === undefined ? true : Boolean(input.active),
        scopes: normalizedScopes,
        createdByUserId: toComparableId(context.user?._id),
      }).save();
      const created = await ServiceAccount.findOne({ _id: account._id }).lean();
      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "service_account.created",
        targetType: "service_account",
        targetId: created?._id || null,
        metadata: {
          scopes: normalizedScopes,
        },
      });
      return toServiceAccountView(created, 0);
    },

    adminUpdateServiceAccount: async (parent, { _id, input }, context) => {
      ensureThatUserIsAdministrator(context);
      const existing = await ServiceAccount.findOne({ _id }).lean();
      if (!existing) {
        throw createGraphQLError("Service account not found");
      }

      const updatePayload: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(input || {}, "name")) {
        const name = String(input.name || "").trim();
        if (!name || name.length < 3) {
          throw createGraphQLError("Service account name must be at least 3 characters", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        updatePayload.name = name;
      }
      if (Object.prototype.hasOwnProperty.call(input || {}, "description")) {
        updatePayload.description = String(input.description || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input || {}, "active")) {
        updatePayload.active = Boolean(input.active);
      }
      if (Object.prototype.hasOwnProperty.call(input || {}, "scopes")) {
        const scopes = toScopeValues(input.scopes);
        if (!scopes.length) {
          throw createGraphQLError("At least one service account scope is required", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        updatePayload.scopes = scopes;
      }

      const updated = await ServiceAccount.findOneAndUpdate(
        { _id },
        { $set: updatePayload },
        { new: true, runValidators: true },
      ).lean();
      if (!updated) {
        throw createGraphQLError("Service account not found");
      }

      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "service_account.updated",
        targetType: "service_account",
        targetId: updated._id,
        metadata: { fields: Object.keys(updatePayload) },
      });
      const tokenCount = await ServiceAccountToken.countDocuments({
        serviceAccountId: updated._id,
        revokedAt: null,
      });
      return toServiceAccountView(updated, tokenCount);
    },

    adminDeleteServiceAccount: async (parent, { _id }, context) => {
      ensureThatUserIsAdministrator(context);
      const deleted = await ServiceAccount.findOneAndDelete({ _id }).lean();
      if (!deleted) {
        throw createGraphQLError("Service account not found");
      }
      await ServiceAccountToken.updateMany(
        { serviceAccountId: deleted._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "service_account.deleted",
        targetType: "service_account",
        targetId: deleted._id,
      });
      return toServiceAccountView(deleted, 0);
    },

    adminIssueServiceAccountToken: async (
      parent,
      { serviceAccountId, label = "", scopes = [], expiresInHours = null },
      context,
    ) => {
      ensureThatUserIsAdministrator(context);
      const issued = await issueServiceAccountToken({
        serviceAccountId,
        label,
        scopes: toScopeValues(scopes),
        expiresInHours,
        actorUserId: toComparableId(context.user?._id),
      });
      if (!issued) {
        throw createGraphQLError("Service account not found");
      }
      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "service_account_token.issued",
        targetType: "service_account",
        targetId: issued.tokenRecord.serviceAccountId,
        metadata: {
          tokenId: issued.tokenRecord._id,
          expiresAt: issued.tokenRecord.expiresAt || null,
          scopes: issued.tokenRecord.scopes,
        },
      });
      return {
        token: issued.token,
        tokenRecord: toTokenRecordView(issued.tokenRecord),
      };
    },

    adminRotateServiceAccountToken: async (parent, { _id, expiresInHours = null }, context) => {
      ensureThatUserIsAdministrator(context);
      const existing = await ServiceAccountToken.findOne({ _id }).lean();
      if (!existing) {
        throw createGraphQLError("Service account token not found");
      }

      await ServiceAccountToken.updateOne(
        { _id: existing._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );

      const issued = await issueServiceAccountToken({
        serviceAccountId: existing.serviceAccountId,
        label: existing.label || "",
        scopes: existing.scopes,
        expiresInHours,
        actorUserId: toComparableId(context.user?._id),
      });
      if (!issued) {
        throw createGraphQLError("Service account not found");
      }
      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "service_account_token.rotated",
        targetType: "service_account",
        targetId: existing.serviceAccountId,
        metadata: {
          previousTokenId: existing._id,
          newTokenId: issued.tokenRecord._id,
        },
      });
      return {
        token: issued.token,
        tokenRecord: toTokenRecordView(issued.tokenRecord),
      };
    },

    adminRevokeServiceAccountToken: async (parent, { _id }, context) => {
      ensureThatUserIsAdministrator(context);
      const revoked = await ServiceAccountToken.findOneAndUpdate(
        { _id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { new: true },
      ).lean();
      if (!revoked) {
        return false;
      }
      await recordAuditEvent({
        actorUserId: context.user?._id || null,
        action: "service_account_token.revoked",
        targetType: "service_account",
        targetId: revoked.serviceAccountId,
        metadata: { tokenId: revoked._id },
      });
      return true;
    },
  },
};

export default resolvers;
