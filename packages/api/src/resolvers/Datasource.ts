/**
 * @module resolvers/Datasource
 * @description GraphQL resolver for datasource runtime session token minting.
 */

import { createGraphQLError } from "graphql-yoga";
import type { IResolvers } from "@graphql-tools/utils";
import type { ApiContext } from "../context.js";
import { recordAuditEvent } from "../audit.js";
import { config } from "../config.js";
import { createClientError, mintDatasourceSessionToken } from "../datasourceGateway.js";
import Dashboard from "../models/Dashboard.js";
import { consumeRateLimit } from "../rateLimit.js";
import { ensureThatPrincipalHasServiceScope } from "../auth.js";
import { recordDatasourceMintMetric } from "../runtimeMetrics.js";

const toComparableId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const toGraphQLError = (
  error: unknown,
  fallbackMessage = "Datasource session token request failed",
) => {
  const typedError =
    error && typeof error === "object"
      ? (error as { statusCode?: number; message?: string })
      : null;
  if (typedError?.statusCode) {
    const code = typedError.statusCode === 429 ? "TOO_MANY_REQUESTS" : "FORBIDDEN";
    return createGraphQLError(typedError.message || fallbackMessage, {
      extensions: { code },
    });
  }
  return createGraphQLError(typedError?.message || fallbackMessage);
};

const enforceMintRateLimit = async ({
  context,
  dashboardId,
  shareToken,
}: {
  context: ApiContext;
  dashboardId: unknown;
  shareToken: unknown;
}) => {
  const normalizedDashboardId = toComparableId(dashboardId);
  const clientIp = String(context.clientIp || "unknown-ip");

  if (context.user?._id) {
    const userId = toComparableId(context.user._id);
    const userBucket = consumeRateLimit(
      `datasource-mint:user:${userId}`,
      config.datasourceTokenMintRateLimitUserPerMin,
    );
    if (!userBucket.allowed) {
      await recordAuditEvent({
        actorUserId: userId,
        action: "datasource.session_token.rate_limited",
        targetType: "dashboard",
        targetId: normalizedDashboardId,
        metadata: {
          scope: "user",
          retryAfterMs: userBucket.retryAfterMs,
        },
      });
      throw createClientError(429, "Too many datasource session token requests");
    }

    const dashboardBucket = consumeRateLimit(
      `datasource-mint:user-dashboard:${userId}:${normalizedDashboardId || "unknown-dashboard"}`,
      config.datasourceTokenMintRateLimitUserPerMin,
    );
    if (!dashboardBucket.allowed) {
      await recordAuditEvent({
        actorUserId: userId,
        action: "datasource.session_token.rate_limited",
        targetType: "dashboard",
        targetId: normalizedDashboardId,
        metadata: {
          scope: "user-dashboard",
          retryAfterMs: dashboardBucket.retryAfterMs,
        },
      });
      throw createClientError(429, "Too many datasource session token requests");
    }
    return;
  }

  const ipBucket = consumeRateLimit(
    `datasource-mint:public-ip:${clientIp}`,
    config.datasourceTokenMintRateLimitPublicIpPerMin,
  );
  if (!ipBucket.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "datasource.session_token.rate_limited",
      targetType: "dashboard",
      targetId: normalizedDashboardId,
      metadata: {
        scope: "public-ip",
        clientIp,
        retryAfterMs: ipBucket.retryAfterMs,
      },
    });
    throw createClientError(429, "Too many datasource session token requests");
  }

  const normalizedShareKey = String(shareToken || normalizedDashboardId || "public").trim();
  const shareBucket = consumeRateLimit(
    `datasource-mint:public-share:${normalizedShareKey}`,
    config.datasourceTokenMintRateLimitShareTokenPerMin,
  );
  if (!shareBucket.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "datasource.session_token.rate_limited",
      targetType: "dashboard",
      targetId: normalizedDashboardId,
      metadata: {
        scope: "public-share",
        shareToken: normalizedShareKey,
        retryAfterMs: shareBucket.retryAfterMs,
      },
    });
    throw createClientError(429, "Too many datasource session token requests");
  }
};

const resolvers: IResolvers = {
  Mutation: {
    mintDatasourceSessionToken: async (
      parent,
      { dashboardId, datasourceId, shareToken },
      context,
    ) => {
      if (context.serviceAccount) {
        ensureThatPrincipalHasServiceScope(context, ["datasource:mint"]);
      }
      const dashboard = await Dashboard.findOne({ _id: dashboardId }).lean();
      if (!dashboard) {
        throw createGraphQLError("Dashboard not found");
      }

      try {
        await enforceMintRateLimit({
          context,
          dashboardId,
          shareToken,
        });

        const minted = await mintDatasourceSessionToken({
          dashboard,
          datasourceId,
          user: context.user || null,
          shareToken,
        });

        recordDatasourceMintMetric({ ok: true });
        return minted;
      } catch (error) {
        recordDatasourceMintMetric({ ok: false });
        throw toGraphQLError(error);
      }
    },
  },
};

export default resolvers;
