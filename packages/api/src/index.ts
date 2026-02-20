/**
 * @module index
 * Entry point for the Freeboard API server.
 *  - Establishes MongoDB connection
 *  - Ensures default admin user creation
 *  - Sets DNS result order to IPv4 first to avoid IPv6 localhost issues
 *  - Sets up GraphQL Yoga server with SSE support
 *  - Starts HTTP server on configured host and port
 */

import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { createYoga } from "graphql-yoga";
import mongoose from "mongoose";
import { useGraphQLSSE } from "@graphql-yoga/plugin-graphql-sse";
import { URL } from "url";

import schema from "./gql.js";
import { setContext } from "./context.js";
import { config } from "./config.js";
import User from "./models/User.js";
import Dashboard from "./models/Dashboard.js";
import {
  resolveGatewayIntrospection,
  validateDatasourceSessionToken,
  type DatasourceSessionTokenClaims,
} from "./datasourceGateway.js";
import { decryptCredentialSecret } from "./credentialEncryption.js";
import type { EncryptedSecretPayload } from "./credentialEncryption.js";
import { consumeRateLimit } from "./rateLimit.js";
import { recordAuditEvent } from "./audit.js";
import { queryShareTokenRevocationFeed } from "./shareTokenRevocationFeed.js";
import { recordApiHttpRequest } from "./runtimeMetrics.js";
import { deriveClientIp } from "./clientIp.js";
import { hashLimiterKeyPart } from "./securityLimiter.js";

import dns from "dns";

dns.setDefaultResultOrder?.("ipv4first");

/**
 * Connect to MongoDB and fail fast on startup errors.
 */
const connectToMongo = async () => {
  let attempts = 0;
  let connected = false;
  while (!connected) {
    attempts += 1;
    try {
      await mongoose.connect(config.mongoUrl, {
        serverSelectionTimeoutMS: 30000,
      });
      console.info(`MongoDB connected on ${config.mongoUrl}`);
      connected = true;
    } catch (error) {
      const errorMessage =
        error && typeof error === "object" && "message" in error
          ? (error as { message?: string }).message
          : undefined;
      console.error(`MongoDB connection attempt ${attempts} failed. Retrying in 2s...`);
      console.error(errorMessage || error);
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }
  }
};

/**
 * Create default admin user on startup if enabled.
 */
const ensureAdminUser = async () => {
  if (!config.createAdmin) {
    return;
  }

  console.log("Admin creation is enabled. Checking for existing admin...");
  const admin = await User.findOne({ email: config.adminEmail });

  if (admin) {
    console.log(`Admin user already exists: ${config.adminEmail}`);
    return;
  }

  console.log(`No admin found with email '${config.adminEmail}'. Creating one now...`);
  await new User({
    email: config.adminEmail,
    password: config.adminPassword,
    role: "admin",
    active: true,
  }).save();
  console.log(`Admin user created: ${config.adminEmail}`);
};

/**
 * A Node.js HTTP server instance.
 * @typedef {Object} HTTPServer
 */

const yoga = createYoga({
  landingPage: false,
  schema,
  context: setContext,
  plugins: [useGraphQLSSE()],
});

const INTERNAL_GATEWAY_INTROSPECTION_PATH = "/internal/gateway/datasource-introspect";
const INTERNAL_GATEWAY_REVOKED_TOKENS_PATH = "/internal/gateway/revoked-tokens";
const INTERNAL_GATEWAY_RATE_LIMIT_CONSUME_PATH = "/internal/gateway/rate-limit/consume";
const ALLOWED_GATEWAY_LIMITER_SCOPES = new Set([
  "realtime-connect-ip",
  "realtime-public-subscribe-ip",
  "realtime-public-subscribe-share",
]);
const GATEWAY_LIMITER_MAX_PER_MINUTE = 10_000;

type JsonObject = Record<string, unknown>;

const readJsonBody = async (req: IncomingMessage, maxBytes = 256 * 1024): Promise<JsonObject> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += normalizedChunk.length;
    if (total > maxBytes) {
      const error = new Error("Request body is too large") as Error & { statusCode?: number };
      error.statusCode = 413;
      throw error;
    }
    chunks.push(normalizedChunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString("utf8").trim();
  if (!bodyText) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    const error = new Error("Invalid JSON payload") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
};

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const resolveErrorStatusCode = (error: unknown, fallback = 500) => {
  if (typeof error !== "object" || !error) {
    return fallback;
  }
  const value = (error as { statusCode?: unknown }).statusCode;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== "object" || !error) {
    return fallback;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
};

const handleGatewayIntrospection = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const clientIp = deriveClientIp(req, {
    trustProxyHops: config.apiTrustProxyHops,
    warningPrefix: "API gateway introspection warning: ",
  });
  const limiterKey = hashLimiterKeyPart(clientIp);
  const rateLimit = await consumeRateLimit(
    `gateway-introspection:${limiterKey}`,
    config.gatewayIntrospectionRateLimitPerMin,
  );
  if (!rateLimit.allowed) {
    const limiterUnavailable = rateLimit.reason === "backend_fail_closed";
    await recordAuditEvent({
      actorUserId: null,
      action: limiterUnavailable
        ? "gateway.introspection.limiter_unavailable"
        : "gateway.introspection.rate_limited",
      targetType: "gateway",
      metadata: {
        clientIp,
        retryAfterMs: limiterUnavailable ? null : rateLimit.retryAfterMs,
      },
    });
    sendJson(res, limiterUnavailable ? 503 : 429, {
      error: limiterUnavailable
        ? "Security limiter unavailable"
        : "Too many introspection requests",
    });
    return;
  }

  const authHeader = String(req.headers.authorization || "");
  const serviceToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!serviceToken || serviceToken !== config.gatewayServiceToken) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const sessionToken = String(body?.sessionToken || "").trim();
    if (!sessionToken) {
      sendJson(res, 400, { error: "sessionToken is required" });
      return;
    }

    const tokenClaims: DatasourceSessionTokenClaims = validateDatasourceSessionToken(sessionToken);
    const dashboardId = String(tokenClaims.dashboardId || "").trim();
    const datasourceId = String(tokenClaims.datasourceId || "").trim();
    if (!dashboardId || !datasourceId) {
      sendJson(res, 400, { error: "Datasource session token is missing claims" });
      return;
    }

    if (body?.dashboardId && String(body.dashboardId).trim() !== dashboardId) {
      sendJson(res, 403, { error: "dashboardId does not match token" });
      return;
    }
    if (body?.datasourceId && String(body.datasourceId).trim() !== datasourceId) {
      sendJson(res, 403, { error: "datasourceId does not match token" });
      return;
    }

    const dashboard = await Dashboard.findOne({ _id: dashboardId }).lean();
    if (!dashboard) {
      sendJson(res, 404, { error: "Dashboard not found" });
      return;
    }

    const resolved = await resolveGatewayIntrospection({
      dashboard,
      datasourceId,
      tokenClaims,
      decryptSecret: (value: unknown) =>
        decryptCredentialSecret((value || null) as EncryptedSecretPayload | null),
    });
    sendJson(res, 200, resolved);
  } catch (error: unknown) {
    const statusCode = resolveErrorStatusCode(error);
    const message =
      statusCode >= 500
        ? "Datasource introspection failed"
        : resolveErrorMessage(error, "Datasource introspection failed");
    sendJson(res, statusCode, { error: message });
  }
};

const handleGatewayRevokedTokens = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const clientIp = deriveClientIp(req, {
    trustProxyHops: config.apiTrustProxyHops,
    warningPrefix: "API gateway revoked-tokens warning: ",
  });
  const limiterKey = hashLimiterKeyPart(clientIp);
  const rateLimit = await consumeRateLimit(
    `gateway-revoked-tokens:${limiterKey}`,
    config.gatewayRevokedTokensRateLimitPerMin,
  );
  if (!rateLimit.allowed) {
    const limiterUnavailable = rateLimit.reason === "backend_fail_closed";
    await recordAuditEvent({
      actorUserId: null,
      action: limiterUnavailable
        ? "gateway.revoked_tokens.limiter_unavailable"
        : "gateway.revoked_tokens.rate_limited",
      targetType: "gateway",
      metadata: {
        clientIp,
        retryAfterMs: limiterUnavailable ? null : rateLimit.retryAfterMs,
      },
    });
    sendJson(res, limiterUnavailable ? 503 : 429, {
      error: limiterUnavailable
        ? "Security limiter unavailable"
        : "Too many revoked token polling requests",
    });
    return;
  }

  const authHeader = String(req.headers.authorization || "");
  const serviceToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!serviceToken || serviceToken !== config.gatewayServiceToken) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const requestedLimit = Number(body?.limit);
    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(Math.floor(requestedLimit), config.gatewayRevokedTokensMaxBatch))
      : config.gatewayRevokedTokensMaxBatch;

    const feed = await queryShareTokenRevocationFeed({
      sinceCursor:
        body?.sinceCursor === undefined ? null : String(body.sinceCursor || "").trim() || null,
      limit: safeLimit,
      retentionSeconds: config.realtimeRevokeEventRetentionSeconds,
    });

    sendJson(res, 200, feed);
  } catch (error: unknown) {
    const statusCode = resolveErrorStatusCode(error);
    const message =
      statusCode >= 500
        ? "Revoked token feed request failed"
        : resolveErrorMessage(error, "Revoked token feed request failed");
    sendJson(res, statusCode, { error: message });
  }
};

const handleGatewayRateLimitConsume = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const authHeader = String(req.headers.authorization || "");
  const serviceToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!serviceToken || serviceToken !== config.gatewayServiceToken) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const scope = String(body?.scope || "")
      .trim()
      .toLowerCase()
      .slice(0, 96);
    const key = String(body?.key || "")
      .trim()
      .toLowerCase()
      .slice(0, 512);
    const requestedLimit = Number(body?.limitPerMinute);
    const limitPerMinute = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(GATEWAY_LIMITER_MAX_PER_MINUTE, Math.floor(requestedLimit)))
      : 1;

    if (!scope || !key) {
      sendJson(res, 400, { error: "scope and key are required" });
      return;
    }
    if (!ALLOWED_GATEWAY_LIMITER_SCOPES.has(scope)) {
      sendJson(res, 400, { error: "scope is not supported" });
      return;
    }

    const rateLimit = await consumeRateLimit(`gateway-realtime:${scope}:${key}`, limitPerMinute);
    if (!rateLimit.allowed && rateLimit.reason === "backend_fail_closed") {
      await recordAuditEvent({
        actorUserId: null,
        action: "gateway.realtime.limiter_unavailable",
        targetType: "gateway",
        metadata: {
          scope,
        },
      });
      sendJson(res, 503, {
        error: "Security limiter unavailable",
        reason: rateLimit.reason,
      });
      return;
    }

    sendJson(res, 200, {
      allowed: rateLimit.allowed,
      retryAfterMs: rateLimit.retryAfterMs,
      remaining: rateLimit.remaining,
      reason: rateLimit.reason,
    });
  } catch (error: unknown) {
    const statusCode = resolveErrorStatusCode(error);
    const message =
      statusCode >= 500
        ? "Gateway limiter consume request failed"
        : resolveErrorMessage(error, "Gateway limiter consume request failed");
    sendJson(res, statusCode, { error: message });
  }
};

/**
 * HTTP server wrapping GraphQL Yoga instance plus internal gateway endpoints.
 * @type {HTTPServer}
 */
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const requestStartedAt = Date.now();
  res.on("finish", () => {
    recordApiHttpRequest({
      statusCode: res.statusCode,
      durationMs: Date.now() - requestStartedAt,
    });
  });

  const requestUrl = new URL(req.url || "/", "http://localhost");
  if (requestUrl.pathname === INTERNAL_GATEWAY_INTROSPECTION_PATH) {
    handleGatewayIntrospection(req, res);
    return;
  }
  if (requestUrl.pathname === INTERNAL_GATEWAY_REVOKED_TOKENS_PATH) {
    handleGatewayRevokedTokens(req, res);
    return;
  }
  if (requestUrl.pathname === INTERNAL_GATEWAY_RATE_LIMIT_CONSUME_PATH) {
    handleGatewayRateLimitConsume(req, res);
    return;
  }
  yoga(req, res);
});

const startServer = async () => {
  try {
    await connectToMongo();
    await ensureAdminUser();

    // Start HTTP server on configured host and port
    server.listen(config.port, config.host, () => {
      const printableHost =
        config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host;
      console.info(`Server is running on http://${printableHost}:${config.port}/graphql`);
    });
  } catch (error) {
    console.error("API startup failed", error);
  }
};

await startServer();
