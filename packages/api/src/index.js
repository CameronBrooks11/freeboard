/**
 * @module index
 * @description Entry point for the Freeboard API server.
 *  - Establishes MongoDB connection
 *  - Ensures default admin user creation
 *  - Sets DNS result order to IPv4 first to avoid IPv6 localhost issues
 *  - Sets up GraphQL Yoga server with SSE support
 *  - Starts HTTP server on configured host and port
 */

import { createServer } from "http";
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
} from "./datasourceGateway.js";
import { decryptCredentialSecret } from "./credentialEncryption.js";
import { consumeRateLimit } from "./rateLimit.js";
import { recordAuditEvent } from "./audit.js";
import { queryShareTokenRevocationFeed } from "./shareTokenRevocationFeed.js";

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
      console.error(`MongoDB connection attempt ${attempts} failed. Retrying in 2s...`);
      console.error(error?.message || error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
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

const getClientIp = (req) => {
  const forwardedForHeader = req.headers["x-forwarded-for"];
  const forwardedFor =
    typeof forwardedForHeader === "string"
      ? forwardedForHeader.split(",")[0]?.trim() || null
      : null;
  return forwardedFor || req.socket?.remoteAddress || "unknown-ip";
};

const readJsonBody = async (req, maxBytes = 256 * 1024) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
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
    const error = new Error("Invalid JSON payload");
    error.statusCode = 400;
    throw error;
  }
};

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const handleGatewayIntrospection = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimit = consumeRateLimit(
    `gateway-introspection:${clientIp}`,
    config.gatewayIntrospectionRateLimitPerMin,
  );
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "gateway.introspection.rate_limited",
      targetType: "gateway",
      metadata: {
        clientIp,
        retryAfterMs: rateLimit.retryAfterMs,
      },
    });
    sendJson(res, 429, { error: "Too many introspection requests" });
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

    const tokenClaims = validateDatasourceSessionToken(sessionToken);
    const dashboardId = String(tokenClaims?.dashboardId || "").trim();
    const datasourceId = String(tokenClaims?.datasourceId || "").trim();
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
      decryptSecret: decryptCredentialSecret,
    });
    sendJson(res, 200, resolved);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = statusCode >= 500 ? "Datasource introspection failed" : error.message;
    sendJson(res, statusCode, { error: message });
  }
};

const handleGatewayRevokedTokens = async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimit = consumeRateLimit(
    `gateway-revoked-tokens:${clientIp}`,
    config.gatewayRevokedTokensRateLimitPerMin,
  );
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      actorUserId: null,
      action: "gateway.revoked_tokens.rate_limited",
      targetType: "gateway",
      metadata: {
        clientIp,
        retryAfterMs: rateLimit.retryAfterMs,
      },
    });
    sendJson(res, 429, { error: "Too many revoked token polling requests" });
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
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = statusCode >= 500 ? "Revoked token feed request failed" : error.message;
    sendJson(res, statusCode, { error: message });
  }
};

/**
 * HTTP server wrapping GraphQL Yoga instance plus internal gateway endpoints.
 * @type {HTTPServer}
 */
const server = createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  if (requestUrl.pathname === INTERNAL_GATEWAY_INTROSPECTION_PATH) {
    handleGatewayIntrospection(req, res);
    return;
  }
  if (requestUrl.pathname === INTERNAL_GATEWAY_REVOKED_TOKENS_PATH) {
    handleGatewayRevokedTokens(req, res);
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
