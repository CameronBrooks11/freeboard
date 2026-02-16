/**
 * @module resolvers/Datasource
 * @description GraphQL resolver for datasource runtime session token minting.
 */

import { createGraphQLError } from "graphql-yoga";
import { recordAuditEvent } from "../audit.js";
import { config } from "../config.js";
import {
  createClientError,
  mintDatasourceSessionToken,
} from "../datasourceGateway.js";
import Dashboard from "../models/Dashboard.js";
import { consumeRateLimit } from "../rateLimit.js";

const toComparableId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

const toGraphQLError = (error, fallbackMessage = "Datasource session token request failed") => {
  if (error?.statusCode) {
    const code = error.statusCode === 429 ? "TOO_MANY_REQUESTS" : "FORBIDDEN";
    return createGraphQLError(error.message || fallbackMessage, {
      extensions: { code },
    });
  }
  return createGraphQLError(error?.message || fallbackMessage);
};

const enforceMintRateLimit = async ({ context, dashboardId, shareToken }) => {
  const clientIp = String(context.clientIp || "unknown-ip");

  if (context.user?._id) {
    const userId = toComparableId(context.user._id);
    const userBucket = consumeRateLimit(
      `datasource-mint:user:${userId}`,
      config.datasourceTokenMintRateLimitUserPerMin
    );
    if (!userBucket.allowed) {
      await recordAuditEvent({
        actorUserId: userId,
        action: "datasource.session_token.rate_limited",
        targetType: "dashboard",
        targetId: dashboardId,
        metadata: {
          scope: "user",
          retryAfterMs: userBucket.retryAfterMs,
        },
      });
      throw createClientError(429, "Too many datasource session token requests");
    }

    const dashboardBucket = consumeRateLimit(
      `datasource-mint:user-dashboard:${userId}:${dashboardId}`,
      config.datasourceTokenMintRateLimitUserPerMin
    );
    if (!dashboardBucket.allowed) {
      await recordAuditEvent({
        actorUserId: userId,
        action: "datasource.session_token.rate_limited",
        targetType: "dashboard",
        targetId: dashboardId,
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
    config.datasourceTokenMintRateLimitPublicIpPerMin
  );
  if (!ipBucket.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "datasource.session_token.rate_limited",
      targetType: "dashboard",
      targetId: dashboardId,
      metadata: {
        scope: "public-ip",
        clientIp,
        retryAfterMs: ipBucket.retryAfterMs,
      },
    });
    throw createClientError(429, "Too many datasource session token requests");
  }

  const normalizedShareKey = String(shareToken || dashboardId || "public").trim();
  const shareBucket = consumeRateLimit(
    `datasource-mint:public-share:${normalizedShareKey}`,
    config.datasourceTokenMintRateLimitShareTokenPerMin
  );
  if (!shareBucket.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "datasource.session_token.rate_limited",
      targetType: "dashboard",
      targetId: dashboardId,
      metadata: {
        scope: "public-share",
        shareToken: normalizedShareKey,
        retryAfterMs: shareBucket.retryAfterMs,
      },
    });
    throw createClientError(429, "Too many datasource session token requests");
  }
};

export default {
  Mutation: {
    mintDatasourceSessionToken: async (
      parent,
      { dashboardId, datasourceId, shareToken },
      context
    ) => {
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

        const minted = mintDatasourceSessionToken({
          dashboard,
          datasourceId,
          user: context.user || null,
          shareToken,
        });

        return minted;
      } catch (error) {
        throw toGraphQLError(error);
      }
    },
  },
};
