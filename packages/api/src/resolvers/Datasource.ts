/**
 * @module resolvers/Datasource
 * GraphQL resolver for datasource runtime session token minting.
 */

import { createGraphQLError } from "graphql-yoga";
import type { IResolvers } from "@graphql-tools/utils";
import type { ApiContext } from "../context.js";
import { recordAuditEvent } from "../audit.js";
import { config } from "../config.js";
import { createClientError, mintDatasourceSessionToken } from "../datasourceGateway.js";
import Dashboard from "../models/Dashboard.js";
import { consumeRateLimit } from "../rateLimit.js";
import { buildLimiterCompositeKey, hashLimiterKeyPart } from "../securityLimiter.js";
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
    const code =
      typedError.statusCode === 429
        ? "TOO_MANY_REQUESTS"
        : typedError.statusCode === 503
          ? "SERVICE_UNAVAILABLE"
          : "FORBIDDEN";
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
    const userBucket = await consumeRateLimit(
      `datasource-mint:user:${buildLimiterCompositeKey(hashLimiterKeyPart(userId))}`,
      config.datasourceTokenMintRateLimitUserPerMin,
    );
    if (!userBucket.allowed) {
      const limiterUnavailable = userBucket.reason === "backend_fail_closed";
      await recordAuditEvent({
        actorUserId: userId,
        action: limiterUnavailable
          ? "datasource.session_token.limiter_unavailable"
          : "datasource.session_token.rate_limited",
        targetType: "dashboard",
        targetId: normalizedDashboardId,
        metadata: {
          scope: "user",
          retryAfterMs: limiterUnavailable ? null : userBucket.retryAfterMs,
        },
      });
      throw createClientError(
        limiterUnavailable ? 503 : 429,
        limiterUnavailable
          ? "Datasource session token limiter is temporarily unavailable"
          : "Too many datasource session token requests",
      );
    }

    const dashboardBucket = await consumeRateLimit(
      `datasource-mint:user-dashboard:${buildLimiterCompositeKey(
        hashLimiterKeyPart(userId),
        hashLimiterKeyPart(normalizedDashboardId || "unknown-dashboard"),
      )}`,
      config.datasourceTokenMintRateLimitUserPerMin,
    );
    if (!dashboardBucket.allowed) {
      const limiterUnavailable = dashboardBucket.reason === "backend_fail_closed";
      await recordAuditEvent({
        actorUserId: userId,
        action: limiterUnavailable
          ? "datasource.session_token.limiter_unavailable"
          : "datasource.session_token.rate_limited",
        targetType: "dashboard",
        targetId: normalizedDashboardId,
        metadata: {
          scope: "user-dashboard",
          retryAfterMs: limiterUnavailable ? null : dashboardBucket.retryAfterMs,
        },
      });
      throw createClientError(
        limiterUnavailable ? 503 : 429,
        limiterUnavailable
          ? "Datasource session token limiter is temporarily unavailable"
          : "Too many datasource session token requests",
      );
    }
    return;
  }

  const ipBucket = await consumeRateLimit(
    `datasource-mint:public-ip:${buildLimiterCompositeKey(hashLimiterKeyPart(clientIp))}`,
    config.datasourceTokenMintRateLimitPublicIpPerMin,
  );
  if (!ipBucket.allowed) {
    const limiterUnavailable = ipBucket.reason === "backend_fail_closed";
    await recordAuditEvent({
      actorUserId: null,
      action: limiterUnavailable
        ? "datasource.session_token.limiter_unavailable"
        : "datasource.session_token.rate_limited",
      targetType: "dashboard",
      targetId: normalizedDashboardId,
      metadata: {
        scope: "public-ip",
        clientIp,
        retryAfterMs: limiterUnavailable ? null : ipBucket.retryAfterMs,
      },
    });
    throw createClientError(
      limiterUnavailable ? 503 : 429,
      limiterUnavailable
        ? "Datasource session token limiter is temporarily unavailable"
        : "Too many datasource session token requests",
    );
  }

  const normalizedShareKey = buildLimiterCompositeKey(
    hashLimiterKeyPart(shareToken || normalizedDashboardId || "public"),
  );
  const shareBucket = await consumeRateLimit(
    `datasource-mint:public-share:${normalizedShareKey}`,
    config.datasourceTokenMintRateLimitShareTokenPerMin,
  );
  if (!shareBucket.allowed) {
    const limiterUnavailable = shareBucket.reason === "backend_fail_closed";
    await recordAuditEvent({
      actorUserId: null,
      action: limiterUnavailable
        ? "datasource.session_token.limiter_unavailable"
        : "datasource.session_token.rate_limited",
      targetType: "dashboard",
      targetId: normalizedDashboardId,
      metadata: {
        scope: "public-share",
        shareTokenProvided: Boolean(shareToken),
        retryAfterMs: limiterUnavailable ? null : shareBucket.retryAfterMs,
      },
    });
    throw createClientError(
      limiterUnavailable ? 503 : 429,
      limiterUnavailable
        ? "Datasource session token limiter is temporarily unavailable"
        : "Too many datasource session token requests",
    );
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
