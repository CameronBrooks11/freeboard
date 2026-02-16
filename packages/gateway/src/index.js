/**
 * @module gateway/index
 * @description Datasource gateway service with secure HTTP fetch and realtime protocol adapters.
 */

import "dotenv/config";
import crypto from "node:crypto";
import * as http from "http";
import * as https from "https";
import dns from "dns";
import express from "express";
import jwt from "jsonwebtoken";
import { EventEmitter } from "node:events";
import net from "net";
import path from "path";
import tls from "node:tls";
import { fileURLToPath } from "url";
import { URL } from "url";
import WebSocket, { WebSocketServer } from "ws";

dns.setDefaultResultOrder?.("ipv4first");

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const toPositiveInteger = (value, fallback) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  const floored = Math.floor(normalized);
  if (floored < 1) {
    return fallback;
  }
  return floored;
};

const toBoundedInteger = (value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }
  const floored = Math.floor(normalized);
  if (floored < min || floored > max) {
    return fallback;
  }
  return floored;
};

const parseCsvList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";

const ALLOW_INSECURE_TLS = toBoolean(process.env.EGRESS_ALLOW_INSECURE_TLS, false);
const ALLOW_PRIVATE_DESTINATIONS = toBoolean(
  process.env.EGRESS_ALLOW_PRIVATE_DESTINATIONS,
  false
);
const REQUEST_TIMEOUT_MS = toPositiveInteger(process.env.FETCH_TIMEOUT_MS, 15000);
const MAX_RESPONSE_BYTES = toPositiveInteger(
  process.env.FETCH_MAX_RESPONSE_BYTES,
  5 * 1024 * 1024
);
const INTROSPECTION_TIMEOUT_MS = toPositiveInteger(
  process.env.GATEWAY_INTROSPECTION_TIMEOUT_MS,
  5000
);
const REVOKED_TOKENS_TIMEOUT_MS = toPositiveInteger(
  process.env.GATEWAY_REVOKED_TOKENS_TIMEOUT_MS,
  5000
);
const REVOKED_TOKENS_MAX_BATCH = toPositiveInteger(
  process.env.GATEWAY_REVOKED_TOKENS_MAX_BATCH,
  500
);
const ALLOWED_HOST_PATTERNS = parseCsvList(process.env.EGRESS_ALLOWED_HOSTS).map((value) =>
  value.toLowerCase()
);
const ALLOWED_PORTS = parseCsvList(process.env.EGRESS_ALLOWED_PORTS || "80,443,1883,8883")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535);
const JWT_GATEWAY_SECRET =
  process.env.JWT_GATEWAY_SECRET ||
  "freeboard-gateway-dev-insecure-local-only-secret-32";
const GATEWAY_SERVICE_TOKEN =
  process.env.GATEWAY_SERVICE_TOKEN ||
  "freeboard-gateway-service-dev-token-local-only-32";
const GATEWAY_API_BASE_URL = process.env.GATEWAY_API_BASE_URL || "http://127.0.0.1:4001";
const GATEWAY_INTROSPECTION_URL =
  `${GATEWAY_API_BASE_URL.replace(/\/$/, "")}/internal/gateway/datasource-introspect`;
const GATEWAY_REVOKED_TOKENS_URL =
  `${GATEWAY_API_BASE_URL.replace(/\/$/, "")}/internal/gateway/revoked-tokens`;

const REALTIME_ENABLED = toBoolean(process.env.REALTIME_ENABLED, true);
const REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP = toPositiveInteger(
  process.env.REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP,
  25
);
const REALTIME_MAX_CONNECTIONS_PER_DASHBOARD = toPositiveInteger(
  process.env.REALTIME_MAX_CONNECTIONS_PER_DASHBOARD,
  1000
);
const REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION = toPositiveInteger(
  process.env.REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION,
  50
);
const REALTIME_CONNECT_TIMEOUT_MS = toPositiveInteger(
  process.env.REALTIME_CONNECT_TIMEOUT_MS,
  10000
);
const REALTIME_RECONNECT_MIN_MS = toPositiveInteger(
  process.env.REALTIME_RECONNECT_MIN_MS,
  1000
);
const REALTIME_RECONNECT_MAX_MS = toPositiveInteger(
  process.env.REALTIME_RECONNECT_MAX_MS,
  30000
);
const REALTIME_MAX_MESSAGE_BYTES = toPositiveInteger(
  process.env.REALTIME_MAX_MESSAGE_BYTES,
  1024 * 1024
);
const REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN = toPositiveInteger(
  process.env.REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN,
  60
);
const REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN = toPositiveInteger(
  process.env.REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN,
  60
);
const REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN = toPositiveInteger(
  process.env.REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN,
  120
);
const REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS = toPositiveInteger(
  process.env.REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS,
  30000
);
const REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS = toPositiveInteger(
  process.env.REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS,
  300000
);
const REALTIME_TRUST_PROXY_HOPS = Math.max(
  0,
  toBoundedInteger(process.env.REALTIME_TRUST_PROXY_HOPS, 0, { min: 0, max: 16 })
);

const REALTIME_SSE_ENABLED = toBoolean(process.env.REALTIME_SSE_ENABLED, true);
const REALTIME_SSE_IDLE_TIMEOUT_MS = toPositiveInteger(
  process.env.REALTIME_SSE_IDLE_TIMEOUT_MS,
  120000
);

const REALTIME_WS_ENABLED = toBoolean(process.env.REALTIME_WS_ENABLED, true);
const REALTIME_WS_IDLE_TIMEOUT_MS = toPositiveInteger(
  process.env.REALTIME_WS_IDLE_TIMEOUT_MS,
  300000
);
const REALTIME_WS_PING_INTERVAL_MS = toPositiveInteger(
  process.env.REALTIME_WS_PING_INTERVAL_MS,
  30000
);

const REALTIME_MQTT_ENABLED = toBoolean(process.env.REALTIME_MQTT_ENABLED, true);
const REALTIME_MQTT_MAX_MESSAGE_BYTES = toPositiveInteger(
  process.env.REALTIME_MQTT_MAX_MESSAGE_BYTES,
  256 * 1024
);
const REALTIME_MQTT_KEEPALIVE_SECONDS = toPositiveInteger(
  process.env.REALTIME_MQTT_KEEPALIVE_SECONDS,
  60
);
const REALTIME_MQTT_ALLOWED_TOPICS = parseCsvList(process.env.REALTIME_MQTT_ALLOWED_TOPICS);
const REALTIME_MQTT_MAX_QOS = Math.max(
  0,
  Math.min(
    1,
    toBoundedInteger(process.env.REALTIME_MQTT_MAX_QOS, 1, { min: 0, max: 1 })
  )
);
const REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER = toPositiveInteger(
  process.env.REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER,
  10
);
const REALTIME_MQTT_IDLE_DISCONNECT_MS = toPositiveInteger(
  process.env.REALTIME_MQTT_IDLE_DISCONNECT_MS,
  300000
);

const STREAM_ERROR_CODES = Object.freeze({
  CONNECT_TIMEOUT: "STREAM_CONNECT_TIMEOUT",
  CONNECT_REFUSED: "STREAM_CONNECT_REFUSED",
  CONNECT_FAILED: "STREAM_CONNECT_FAILED",
  AUTH_FAILED: "STREAM_AUTH_FAILED",
  IDLE_TIMEOUT: "STREAM_IDLE_TIMEOUT",
  MESSAGE_TOO_LARGE: "STREAM_MESSAGE_TOO_LARGE",
  PROTOCOL_ERROR: "STREAM_PROTOCOL_ERROR",
  POLICY_BLOCKED: "STREAM_POLICY_BLOCKED",
  RATE_LIMITED: "STREAM_RATE_LIMITED",
});

const isWeakSecret = (secret) => {
  if (!secret || typeof secret !== "string") {
    return true;
  }
  const normalized = secret.trim().toLowerCase();
  if (normalized.length < 32) {
    return true;
  }
  if (
    normalized.includes("replace-with") ||
    normalized.includes("example") ||
    normalized.includes("local-only")
  ) {
    return true;
  }
  return ["freeboard", "changeme", "default", "secret", "password"].includes(
    normalized
  );
};

if (IS_PRODUCTION && ALLOW_INSECURE_TLS) {
  throw new Error("EGRESS_ALLOW_INSECURE_TLS=true is not allowed in production.");
}

if (IS_PRODUCTION && ALLOWED_HOST_PATTERNS.length === 0) {
  throw new Error(
    "EGRESS_ALLOWED_HOSTS must be configured in production (comma-separated host allowlist)."
  );
}

if (IS_PRODUCTION && isWeakSecret(JWT_GATEWAY_SECRET)) {
  throw new Error("JWT_GATEWAY_SECRET is missing or too weak for production runtime.");
}

if (IS_PRODUCTION && isWeakSecret(GATEWAY_SERVICE_TOKEN)) {
  throw new Error(
    "GATEWAY_SERVICE_TOKEN is missing or too weak for production runtime."
  );
}

const blockedIpv4Ranges = [
  { start: "0.0.0.0", end: "0.255.255.255" },
  { start: "10.0.0.0", end: "10.255.255.255" },
  { start: "100.64.0.0", end: "100.127.255.255" },
  { start: "127.0.0.0", end: "127.255.255.255" },
  { start: "169.254.0.0", end: "169.254.255.255" },
  { start: "172.16.0.0", end: "172.31.255.255" },
  { start: "192.0.0.0", end: "192.0.0.255" },
  { start: "192.0.2.0", end: "192.0.2.255" },
  { start: "192.168.0.0", end: "192.168.255.255" },
  { start: "198.18.0.0", end: "198.19.255.255" },
  { start: "198.51.100.0", end: "198.51.100.255" },
  { start: "203.0.113.0", end: "203.0.113.255" },
  { start: "224.0.0.0", end: "239.255.255.255" },
  { start: "240.0.0.0", end: "255.255.255.255" },
];

const rateLimitBuckets = new Map();

const createClientError = (statusCode, message, streamErrorCode = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (streamErrorCode) {
    error.streamErrorCode = streamErrorCode;
  }
  return error;
};

const writeError = (clientRes, error) => {
  const statusCode = Number(error?.statusCode) || 500;
  const message = statusCode >= 500 ? "Gateway request failed" : error?.message;
  if (!clientRes.headersSent) {
    clientRes.status(statusCode).json({ error: message || "Gateway request failed" });
  } else {
    clientRes.end();
  }
};

const consumeRateLimit = (key, limitPerMinute) => {
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const windowMs = 60_000;
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= limitPerMinute) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
};

const ipToNumber = (ip) =>
  ip
    .split(".")
    .map((part) => Number(part))
    .reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;

const isBlockedIpv4 = (ip) => {
  const ipNumber = ipToNumber(ip);
  return blockedIpv4Ranges.some(({ start, end }) => {
    const startNumber = ipToNumber(start);
    const endNumber = ipToNumber(end);
    return ipNumber >= startNumber && ipNumber <= endNumber;
  });
};

const isBlockedIpv6 = (ip) => {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) {
    return true;
  }
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  if (normalized.startsWith("ff")) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice(7);
    if (net.isIP(mappedIpv4) === 4) {
      return isBlockedIpv4(mappedIpv4);
    }
  }

  return false;
};

const isBlockedIpAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) {
    return isBlockedIpv4(address);
  }
  if (family === 6) {
    return isBlockedIpv6(address);
  }
  return true;
};

const isBlockedHostname = (hostname) => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  return !normalized.includes(".");
};

const hostMatchesPattern = (hostname, pattern) => {
  if (pattern === "*") {
    return !IS_PRODUCTION;
  }

  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }

  return hostname === pattern;
};

const isAllowedHost = (hostname) => {
  if (ALLOWED_HOST_PATTERNS.length === 0) {
    return !IS_PRODUCTION;
  }

  return ALLOWED_HOST_PATTERNS.some((pattern) => hostMatchesPattern(hostname, pattern));
};

const hasAllowedPort = (port) => ALLOWED_PORTS.includes(port);

const parseOutboundUrl = ({
  rawTarget,
  allowedProtocols,
  defaultPortByProtocol,
  protocolErrorMessage,
}) => {
  if (!rawTarget || typeof rawTarget !== "string") {
    throw createClientError(400, "Target URL is required");
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw createClientError(400, "Invalid target URL");
  }

  if (!allowedProtocols.has(target.protocol)) {
    throw createClientError(400, protocolErrorMessage);
  }

  if (target.username || target.password) {
    throw createClientError(400, "Credentials in URL are not allowed");
  }

  const defaultPort = defaultPortByProtocol[target.protocol];
  const port = Number(target.port || defaultPort || 0);
  if (!hasAllowedPort(port)) {
    throw createClientError(403, "Target port is not allowed");
  }

  const hostname = target.hostname.toLowerCase();
  if (!isAllowedHost(hostname)) {
    throw createClientError(403, "Target host is not allowed");
  }

  if (!ALLOW_PRIVATE_DESTINATIONS && isBlockedHostname(hostname)) {
    throw createClientError(403, "Target host is blocked");
  }

  return { target, port, hostname };
};

/**
 * Parse and validate target URL.
 *
 * @param {string} rawTarget
 * @returns {{target: URL, port: number, hostname: string}}
 */
export const parseTargetUrl = (rawTarget) =>
  parseOutboundUrl({
    rawTarget,
    allowedProtocols: new Set(["http:", "https:"]),
    defaultPortByProtocol: {
      "http:": 80,
      "https:": 443,
    },
    protocolErrorMessage: "Only http and https protocols are allowed",
  });

/**
 * Resolve and validate outbound destination. Returns pinned destination address.
 *
 * @param {string} hostname
 * @param {{lookup?: Function}} [options]
 * @returns {Promise<{address: string, family: 4|6}>}
 */
export const ensureResolvedDestinationIsAllowed = async (
  hostname,
  { lookup = dns.promises.lookup } = {}
) => {
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw createClientError(502, "Unable to resolve target host");
  }

  if (!ALLOW_PRIVATE_DESTINATIONS) {
    for (const record of resolved) {
      if (isBlockedIpAddress(record.address)) {
        throw createClientError(403, "Target resolves to a blocked address");
      }
    }
  }

  const primaryRecord = resolved[0];
  return {
    address: primaryRecord.address,
    family: Number(primaryRecord.family) === 6 ? 6 : 4,
  };
};

const normalizeRequestHeaders = (headers = {}) => {
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = String(rawKey || "").trim();
    if (!key) {
      continue;
    }

    const lowered = key.toLowerCase();
    if (["host", "content-length", "connection"].includes(lowered)) {
      continue;
    }

    normalized[key] = String(rawValue ?? "");
  }
  return normalized;
};

const buildHostHeader = ({ hostname, port, defaultPort }) => {
  if (port === defaultPort) {
    return hostname;
  }
  return `${hostname}:${port}`;
};

const createUpstreamRequestOptions = ({
  target,
  port,
  hostname,
  resolvedDestination,
  bodyText,
  headers,
  timeoutMs,
}) => {
  const isHttps = target.protocol === "https:";
  const hostHeader = buildHostHeader({
    hostname,
    port,
    defaultPort: isHttps ? 443 : 80,
  });
  const outgoingHeaders = {
    accept: "*/*",
    "user-agent": "freeboard-gateway/http",
    host: hostHeader,
    ...normalizeRequestHeaders(headers),
  };

  if (bodyText) {
    outgoingHeaders["content-length"] = String(Buffer.byteLength(bodyText));
    if (!outgoingHeaders["content-type"]) {
      outgoingHeaders["content-type"] = "application/json";
    }
  }

  const options = {
    protocol: target.protocol,
    hostname: resolvedDestination.address,
    family: resolvedDestination.family,
    lookup: (_unusedHostname, _unusedOptions, callback) => {
      callback(null, resolvedDestination.address, resolvedDestination.family);
    },
    port,
    path: `${target.pathname}${target.search}`,
    method: "GET",
    headers: outgoingHeaders,
    timeout: timeoutMs,
  };

  if (isHttps) {
    options.agent = new https.Agent({
      rejectUnauthorized: !ALLOW_INSECURE_TLS,
      servername: hostname,
    });
  }

  return options;
};

const parseCsv = (csvText) => {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(",").map((part) => part.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((part) => part.trim());
    const item = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      item[header] = values[index] ?? "";
    });
    return item;
  });
};

const parseGatewayResponse = ({ parser, payload }) => {
  const normalizedParser = String(parser || "json").toLowerCase();
  if (normalizedParser === "text") {
    return payload;
  }
  if (normalizedParser === "csv") {
    return parseCsv(payload);
  }

  try {
    return JSON.parse(payload);
  } catch {
    throw createClientError(502, "Upstream response is not valid JSON");
  }
};

const executeIntentFetch = async ({ intent, lookup, httpRequest, httpsRequest }) => {
  const { target, port, hostname } = parseTargetUrl(intent.url);
  const resolvedDestination = await ensureResolvedDestinationIsAllowed(hostname, {
    lookup,
  });
  const bodyText =
    intent.body === null || intent.body === undefined ? "" : String(intent.body);
  const timeoutMs = Number(intent.timeoutMs) > 0 ? Number(intent.timeoutMs) : REQUEST_TIMEOUT_MS;

  const options = createUpstreamRequestOptions({
    target,
    port,
    hostname,
    resolvedDestination,
    bodyText,
    headers: intent.headers,
    timeoutMs,
  });
  options.method = String(intent.method || "GET").toUpperCase();

  const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest;

  const payload = await new Promise((resolve, reject) => {
    const upstream = requestFn(options, (upstreamRes) => {
      const upstreamStatusCode = Number(upstreamRes.statusCode) || 0;
      let totalBytes = 0;
      const chunks = [];

      upstreamRes.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          upstreamRes.destroy(createClientError(502, "Response exceeded fetch size limit"));
          return;
        }
        chunks.push(chunk);
      });

      upstreamRes.on("end", () => {
        if (upstreamStatusCode < 200 || upstreamStatusCode >= 300) {
          reject(createClientError(502, `Upstream request failed (${upstreamStatusCode})`));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });

      upstreamRes.on("error", (error) => {
        reject(error);
      });
    });

    upstream.on("timeout", () => {
      upstream.destroy(createClientError(504, "Upstream request timed out"));
    });

    upstream.on("error", (error) => {
      reject(error);
    });

    if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method) && bodyText) {
      upstream.write(bodyText);
    }
    upstream.end();
  });

  return parseGatewayResponse({
    parser: intent.parser,
    payload,
  });
};

const validateSessionToken = (token, { expectedScope = null } = {}) => {
  let claims;
  try {
    claims = jwt.verify(token, JWT_GATEWAY_SECRET, {
      algorithms: ["HS256"],
      audience: "freeboard-gateway",
      issuer: "freeboard-api",
    });
  } catch {
    throw createClientError(401, "Invalid datasource session token");
  }

  if (expectedScope && String(claims?.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch");
  }

  return claims;
};

const fetchJson = async ({ url, body, timeoutMs, fetchFn = fetch }) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, Math.max(500, timeoutMs));

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createClientError(504, "Internal API request timed out");
    }
    throw createClientError(502, "Internal API request failed");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createClientError(response.status, payload?.error || "Internal API request failed");
  }

  return payload;
};

const fetchIntrospection = async ({
  sessionToken,
  dashboardId,
  datasourceId,
  fetchFn = fetch,
}) =>
  fetchJson({
    url: GATEWAY_INTROSPECTION_URL,
    body: {
      sessionToken,
      dashboardId,
      datasourceId,
    },
    timeoutMs: INTROSPECTION_TIMEOUT_MS,
    fetchFn,
  });

const fetchRevokedTokens = async ({ sinceCursor, limit, fetchFn = fetch }) =>
  fetchJson({
    url: GATEWAY_REVOKED_TOKENS_URL,
    body: {
      sinceCursor,
      limit,
    },
    timeoutMs: REVOKED_TOKENS_TIMEOUT_MS,
    fetchFn,
  });

/**
 * Build gateway fetch request handler.
 *
 * @param {{lookup?: Function, httpRequest?: Function, httpsRequest?: Function, fetchFn?: Function}} [options]
 * @returns {import('express').RequestHandler}
 */
export const createGatewayFetchHandler = ({
  lookup = dns.promises.lookup,
  httpRequest = http.request,
  httpsRequest = https.request,
  fetchFn = fetch,
} = {}) =>
  async (clientReq, clientRes) => {
    try {
      const authHeader = String(clientReq.headers.authorization || "");
      const sessionToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
      if (!sessionToken) {
        throw createClientError(401, "Missing datasource session token");
      }

      const tokenClaims = validateSessionToken(sessionToken, {
        expectedScope: "datasource:fetch",
      });
      const dashboardId = String(
        clientReq.body?.dashboardId || tokenClaims.dashboardId || ""
      ).trim();
      const datasourceId = String(
        clientReq.body?.datasourceId || tokenClaims.datasourceId || ""
      ).trim();
      if (!dashboardId || !datasourceId) {
        throw createClientError(400, "dashboardId and datasourceId are required");
      }

      if (
        dashboardId !== String(tokenClaims.dashboardId || "") ||
        datasourceId !== String(tokenClaims.datasourceId || "")
      ) {
        throw createClientError(403, "Datasource identifiers do not match token claims");
      }

      const introspection = await fetchIntrospection({
        sessionToken,
        dashboardId,
        datasourceId,
        fetchFn,
      });

      const intent = introspection?.intent;
      if (!intent || typeof intent !== "object") {
        throw createClientError(502, "Introspection payload is invalid");
      }

      const data = await executeIntentFetch({
        intent,
        lookup,
        httpRequest,
        httpsRequest,
      });

      clientRes.status(200).json({
        dashboardId,
        datasourceId,
        data,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      writeError(clientRes, error);
    }
  };

const getSocketRemoteAddress = (request) => {
  const raw = String(request?.socket?.remoteAddress || "unknown-ip");
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
};

export const getTokenExpiryDelayMs = (tokenClaims, nowMs = Date.now()) => {
  const expSeconds = Number(tokenClaims?.exp);
  if (!Number.isFinite(expSeconds)) {
    return null;
  }
  return Math.floor(expSeconds * 1000 - nowMs);
};

export const deriveClientIp = (request) => {
  const socketAddress = getSocketRemoteAddress(request);
  if (REALTIME_TRUST_PROXY_HOPS <= 0) {
    return socketAddress;
  }

  const forwardedForHeader = request?.headers?.["x-forwarded-for"];
  if (typeof forwardedForHeader !== "string" || !forwardedForHeader.trim()) {
    console.warn(
      "Realtime gateway warning: REALTIME_TRUST_PROXY_HOPS>0 but X-Forwarded-For is missing; falling back to socket remote address."
    );
    return socketAddress;
  }

  const forwardedEntries = forwardedForHeader
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (forwardedEntries.length <= REALTIME_TRUST_PROXY_HOPS) {
    console.warn(
      "Realtime gateway warning: X-Forwarded-For has fewer entries than REALTIME_TRUST_PROXY_HOPS; falling back to socket remote address."
    );
    return socketAddress;
  }

  const selected = forwardedEntries[forwardedEntries.length - 1 - REALTIME_TRUST_PROXY_HOPS];
  return selected.startsWith("::ffff:") ? selected.slice(7) : selected;
};

const mapStreamErrorCode = (error, fallback = STREAM_ERROR_CODES.CONNECT_FAILED) => {
  if (error?.streamErrorCode) {
    return error.streamErrorCode;
  }

  const statusCode = Number(error?.statusCode) || 0;
  if (statusCode === 401 || statusCode === 403) {
    return STREAM_ERROR_CODES.AUTH_FAILED;
  }
  if (statusCode === 429) {
    return STREAM_ERROR_CODES.RATE_LIMITED;
  }
  if (statusCode >= 400 && statusCode < 500) {
    return STREAM_ERROR_CODES.POLICY_BLOCKED;
  }
  if (statusCode === 504) {
    return STREAM_ERROR_CODES.CONNECT_TIMEOUT;
  }
  return fallback;
};

const sanitizeErrorMessage = (error, fallback) => {
  const statusCode = Number(error?.statusCode) || 500;
  if (statusCode >= 500) {
    return fallback;
  }
  return String(error?.message || fallback);
};

const parseStreamPayload = (raw, parser) => {
  const normalizedParser = String(parser || "json").toLowerCase();
  if (normalizedParser === "text") {
    return raw;
  }
  return JSON.parse(raw);
};

const parseRealtimeTargetUrl = ({ rawTarget, protocol }) => {
  if (protocol === "sse") {
    return parseTargetUrl(rawTarget);
  }

  if (protocol === "websocket") {
    return parseOutboundUrl({
      rawTarget,
      allowedProtocols: new Set(["ws:", "wss:"]),
      defaultPortByProtocol: {
        "ws:": 80,
        "wss:": 443,
      },
      protocolErrorMessage: "WebSocket intents must use ws:// or wss://",
    });
  }

  if (protocol === "mqtt") {
    return parseOutboundUrl({
      rawTarget,
      allowedProtocols: new Set(["mqtt:", "mqtts:"]),
      defaultPortByProtocol: {
        "mqtt:": 1883,
        "mqtts:": 8883,
      },
      protocolErrorMessage: "MQTT intents must use mqtt:// or mqtts://",
    });
  }

  throw createClientError(
    400,
    "Realtime protocol is not supported",
    STREAM_ERROR_CODES.POLICY_BLOCKED
  );
};

export const matchesMqttTopicPattern = (topic, pattern) => {
  const topicLevels = String(topic || "").split("/");
  const patternLevels = String(pattern || "").split("/");

  for (let index = 0; index < patternLevels.length; index += 1) {
    const patternLevel = patternLevels[index];
    const topicLevel = topicLevels[index];

    if (patternLevel === "#") {
      return index === patternLevels.length - 1;
    }

    if (topicLevel === undefined) {
      return false;
    }

    if (patternLevel === "+") {
      continue;
    }

    if (patternLevel !== topicLevel) {
      return false;
    }
  }

  return topicLevels.length === patternLevels.length;
};

const isMqttTopicAllowed = (topic, allowlist) =>
  Array.isArray(allowlist) && allowlist.some((pattern) => matchesMqttTopicPattern(topic, pattern));

const normalizeMqttAllowlist = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
};

const encodeMqttString = (value) => {
  const encoded = Buffer.from(String(value || ""), "utf8");
  const header = Buffer.alloc(2);
  header.writeUInt16BE(encoded.length, 0);
  return Buffer.concat([header, encoded]);
};

const encodeMqttRemainingLength = (value) => {
  const bytes = [];
  let remaining = value;
  do {
    let digit = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) {
      digit |= 0x80;
    }
    bytes.push(digit);
  } while (remaining > 0);
  return Buffer.from(bytes);
};

const decodeMqttRemainingLength = (buffer, offset = 1) => {
  let multiplier = 1;
  let value = 0;
  let consumed = 0;

  while (true) {
    const byte = buffer[offset + consumed];
    if (byte === undefined) {
      return null;
    }

    value += (byte & 0x7f) * multiplier;
    consumed += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
    multiplier *= 128;
    if (consumed > 4) {
      return null;
    }
  }

  return {
    value,
    bytesUsed: consumed,
  };
};

const buildMqttConnectPacket = ({
  clientId,
  username,
  password,
  keepaliveSeconds,
}) => {
  const protocolName = encodeMqttString("MQTT");
  const protocolLevel = Buffer.from([0x04]);
  let connectFlags = 0x02;

  const usernameValue = String(username || "");
  const passwordValue = String(password || "");
  if (usernameValue) {
    connectFlags |= 0x80;
  }
  if (passwordValue) {
    connectFlags |= 0x40;
  }

  const connectFlagsBuffer = Buffer.from([connectFlags]);
  const keepaliveBuffer = Buffer.alloc(2);
  keepaliveBuffer.writeUInt16BE(
    Math.max(5, Math.min(3600, Math.floor(Number(keepaliveSeconds) || 60))),
    0
  );

  const payloadParts = [encodeMqttString(clientId)];
  if (usernameValue) {
    payloadParts.push(encodeMqttString(usernameValue));
  }
  if (passwordValue) {
    payloadParts.push(encodeMqttString(passwordValue));
  }

  const variableHeader = Buffer.concat([
    protocolName,
    protocolLevel,
    connectFlagsBuffer,
    keepaliveBuffer,
  ]);
  const payload = Buffer.concat(payloadParts);
  const remainingLength = encodeMqttRemainingLength(
    variableHeader.length + payload.length
  );

  return Buffer.concat([Buffer.from([0x10]), remainingLength, variableHeader, payload]);
};

const buildMqttSubscribePacket = ({ packetId, topic, qos }) => {
  const variableHeader = Buffer.alloc(2);
  variableHeader.writeUInt16BE(packetId, 0);
  const payload = Buffer.concat([
    encodeMqttString(topic),
    Buffer.from([Math.max(0, Math.min(1, Math.floor(Number(qos) || 0)))]),
  ]);
  const remainingLength = encodeMqttRemainingLength(
    variableHeader.length + payload.length
  );
  return Buffer.concat([Buffer.from([0x82]), remainingLength, variableHeader, payload]);
};

const buildMqttUnsubscribePacket = ({ packetId, topic }) => {
  const variableHeader = Buffer.alloc(2);
  variableHeader.writeUInt16BE(packetId, 0);
  const payload = encodeMqttString(topic);
  const remainingLength = encodeMqttRemainingLength(
    variableHeader.length + payload.length
  );
  return Buffer.concat([Buffer.from([0xa2]), remainingLength, variableHeader, payload]);
};

const buildMqttPingPacket = () => Buffer.from([0xc0, 0x00]);
const buildMqttDisconnectPacket = () => Buffer.from([0xe0, 0x00]);

const buildMqttPubAckPacket = (packetId) => {
  const packet = Buffer.alloc(4);
  packet[0] = 0x40;
  packet[1] = 0x02;
  packet.writeUInt16BE(packetId, 2);
  return packet;
};

class SimpleMqttClient extends EventEmitter {
  brokerUrl;

  username;

  password;

  resolvedAddress;

  resolvedFamily;

  tlsServername;

  keepaliveSeconds;

  connectTimeoutMs;

  reconnectMinMs;

  reconnectMaxMs;

  tlsOptions;

  socket = null;

  connected = false;

  closed = false;

  packetId = 1;

  reconnectAttempt = 0;

  reconnectTimer = null;

  connectTimer = null;

  pingTimer = null;

  incomingBuffer = Buffer.alloc(0);

  subscriptions = new Map();

  constructor({
    brokerUrl,
    username = "",
    password = "",
    resolvedAddress = "",
    resolvedFamily = null,
    tlsServername = "",
    keepaliveSeconds = 60,
    connectTimeoutMs = 10000,
    reconnectMinMs = 1000,
    reconnectMaxMs = 30000,
    tlsOptions = {},
  }) {
    super();
    this.brokerUrl = brokerUrl;
    this.username = String(username || "");
    this.password = String(password || "");
    this.resolvedAddress = String(resolvedAddress || "").trim();
    this.resolvedFamily =
      Number(resolvedFamily) === 6 ? 6 : Number(resolvedFamily) === 4 ? 4 : null;
    this.tlsServername = String(tlsServername || "").trim();
    this.keepaliveSeconds = Math.max(
      5,
      Math.min(3600, Math.floor(Number(keepaliveSeconds) || 60))
    );
    this.connectTimeoutMs = Math.max(1000, Math.floor(Number(connectTimeoutMs) || 10000));
    this.reconnectMinMs = Math.max(500, Math.floor(Number(reconnectMinMs) || 1000));
    this.reconnectMaxMs = Math.max(
      this.reconnectMinMs,
      Math.floor(Number(reconnectMaxMs) || 30000)
    );
    this.tlsOptions =
      tlsOptions && typeof tlsOptions === "object" && !Array.isArray(tlsOptions)
        ? tlsOptions
        : {};
  }

  nextPacketId() {
    this.packetId += 1;
    if (this.packetId > 0xffff) {
      this.packetId = 1;
    }
    return this.packetId;
  }

  resetConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = setTimeout(() => {
      this.emit("error", createClientError(504, "MQTT connect timeout"));
      this.socket?.destroy();
    }, this.connectTimeoutMs);
  }

  clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  startPingLoop() {
    this.stopPingLoop();
    const intervalMs = Math.max(1000, Math.floor((this.keepaliveSeconds * 1000) / 2));
    this.pingTimer = setInterval(() => {
      if (!this.connected || !this.socket || this.socket.destroyed) {
        return;
      }
      this.socket.write(buildMqttPingPacket());
    }, intervalMs);
  }

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  connect() {
    if (this.closed) {
      return;
    }

    const parsed = new URL(this.brokerUrl);
    const isTls = parsed.protocol === "mqtts:";
    const port = Number(parsed.port || (isTls ? 8883 : 1883));
    const host = this.resolvedAddress || parsed.hostname;
    const tlsServername = this.tlsServername || parsed.hostname;

    this.resetConnectTimer();

    this.socket = isTls
      ? tls.connect({
          host,
          port,
          ...(this.resolvedFamily
            ? {
                family: this.resolvedFamily,
              }
            : {}),
          servername: tlsServername,
          rejectUnauthorized: !ALLOW_INSECURE_TLS,
          ...this.tlsOptions,
        })
      : net.connect({
          host,
          port,
          ...(this.resolvedFamily
            ? {
                family: this.resolvedFamily,
              }
            : {}),
        });

    this.socket.on("connect", () => {
      if (!this.socket || this.closed) {
        return;
      }

      const clientId = `freeboard-gw-${crypto.randomBytes(8).toString("hex")}`;
      const packet = buildMqttConnectPacket({
        clientId,
        username: this.username,
        password: this.password,
        keepaliveSeconds: this.keepaliveSeconds,
      });
      this.socket.write(packet);
    });

    this.socket.on("data", (chunk) => {
      this.incomingBuffer = Buffer.concat([this.incomingBuffer, Buffer.from(chunk)]);
      this.processIncomingBuffer();
    });

    this.socket.on("error", (error) => {
      this.emit("error", error);
    });

    this.socket.on("close", () => {
      this.clearConnectTimer();
      this.stopPingLoop();
      this.connected = false;
      this.emit("close");
      if (!this.closed) {
        this.scheduleReconnect();
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.closed) {
      return;
    }

    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.reconnectMaxMs,
      this.reconnectMinMs * 2 ** (this.reconnectAttempt - 1)
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  sendPacket(packet) {
    if (!this.socket || this.socket.destroyed) {
      throw createClientError(502, "MQTT socket is not connected");
    }
    this.socket.write(packet);
  }

  processIncomingBuffer() {
    while (this.incomingBuffer.length >= 2) {
      const remainingLengthDecoded = decodeMqttRemainingLength(this.incomingBuffer, 1);
      if (!remainingLengthDecoded) {
        return;
      }

      const fixedHeaderLength = 1 + remainingLengthDecoded.bytesUsed;
      const totalLength = fixedHeaderLength + remainingLengthDecoded.value;
      if (this.incomingBuffer.length < totalLength) {
        return;
      }

      const packet = this.incomingBuffer.slice(0, totalLength);
      this.incomingBuffer = this.incomingBuffer.slice(totalLength);

      const firstByte = packet[0];
      const packetType = firstByte >> 4;
      const body = packet.slice(fixedHeaderLength);

      if (packetType === 2) {
        const returnCode = body[1];
        if (returnCode !== 0) {
          this.emit(
            "error",
            createClientError(502, `MQTT broker rejected connection (${returnCode})`)
          );
          this.socket?.destroy();
          return;
        }

        this.clearConnectTimer();
        this.reconnectAttempt = 0;
        this.connected = true;
        this.startPingLoop();
        this.emit("connect");
        this.resubscribeAll();
        continue;
      }

      if (packetType === 3) {
        if (body.length < 2) {
          continue;
        }

        const topicLength = body.readUInt16BE(0);
        let cursor = 2;
        const topic = body.slice(cursor, cursor + topicLength).toString("utf8");
        cursor += topicLength;

        const qos = (firstByte >> 1) & 0x03;
        let packetId = null;
        if (qos > 0 && body.length >= cursor + 2) {
          packetId = body.readUInt16BE(cursor);
          cursor += 2;
        }

        const payload = body.slice(cursor);
        this.emit("message", topic, payload);

        if (qos === 1 && packetId !== null && this.socket && !this.socket.destroyed) {
          this.socket.write(buildMqttPubAckPacket(packetId));
        }
      }
    }
  }

  subscribe(topic, { qos = 0 } = {}, callback = () => {}) {
    const normalizedTopic = String(topic || "").trim();
    if (!normalizedTopic) {
      callback(createClientError(400, "MQTT topic is required"));
      return;
    }

    const normalizedQos = Math.max(0, Math.min(1, Math.floor(Number(qos) || 0)));
    this.subscriptions.set(normalizedTopic, normalizedQos);

    if (!this.connected) {
      callback(null);
      return;
    }

    try {
      this.sendPacket(
        buildMqttSubscribePacket({
          packetId: this.nextPacketId(),
          topic: normalizedTopic,
          qos: normalizedQos,
        })
      );
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  unsubscribe(topic, callback = () => {}) {
    const normalizedTopic = String(topic || "").trim();
    if (!normalizedTopic) {
      callback(null);
      return;
    }

    this.subscriptions.delete(normalizedTopic);
    if (!this.connected) {
      callback(null);
      return;
    }

    try {
      this.sendPacket(
        buildMqttUnsubscribePacket({
          packetId: this.nextPacketId(),
          topic: normalizedTopic,
        })
      );
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  resubscribeAll() {
    for (const [topic, qos] of this.subscriptions.entries()) {
      try {
        this.sendPacket(
          buildMqttSubscribePacket({
            packetId: this.nextPacketId(),
            topic,
            qos,
          })
        );
      } catch (error) {
        this.emit("error", error);
      }
    }
  }

  end(force = true) {
    this.closed = true;
    this.clearConnectTimer();
    this.stopPingLoop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && !this.socket.destroyed) {
      try {
        if (this.connected) {
          this.socket.write(buildMqttDisconnectPacket());
        }
      } catch {
        // ignore disconnect write failures
      }

      if (force) {
        this.socket.destroy();
      } else {
        this.socket.end();
      }
    }
  }
}

/**
 * Attach realtime gateway websocket endpoint to an HTTP server.
 *
 * @param {Object} options
 * @param {import('http').Server} options.server
 * @param {Function} [options.lookup]
 * @param {Function} [options.fetchFn]
 * @param {(options: any) => WebSocketServer} [options.wsServerFactory]
 * @param {(url: string, protocols?: string|string[], options?: any) => WebSocket} [options.wsClientFactory]
 * @returns {{close: () => Promise<void>, wss: WebSocketServer}}
 */
export const createRealtimeGateway = ({
  server,
  lookup = dns.promises.lookup,
  fetchFn = fetch,
  wsServerFactory = (options) => new WebSocketServer(options),
  wsClientFactory = (url, protocols, options) => new WebSocket(url, protocols, options),
} = {}) => {
  const wss = wsServerFactory({
    noServer: true,
    maxPayload: REALTIME_MAX_MESSAGE_BYTES,
  });

  const connectionsById = new Map();
  const connectionCountByIp = new Map();
  const dashboardConnectionRefs = new Map();
  const publicSubscriptions = new Map();
  const mqttPool = new Map();

  let revocationCursor = null;
  let pollingRevocations = false;

  const sendWsResponse = (connection, payload) => {
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    let serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return false;
    }

    if (Buffer.byteLength(serialized, "utf8") > REALTIME_MAX_MESSAGE_BYTES) {
      return false;
    }

    connection.ws.send(serialized);
    return true;
  };

  const sendAck = (connection, {
    requestId,
    datasourceId = null,
    ok,
    errorCode = null,
    message = null,
  }) => {
    sendWsResponse(connection, {
      type: "ack",
      requestId,
      datasourceId,
      ok: Boolean(ok),
      ...(errorCode
        ? {
            errorCode,
          }
        : {}),
      ...(message
        ? {
            message,
          }
        : {}),
      timestamp: new Date().toISOString(),
    });
  };

  const sendStatus = (connection, {
    datasourceId,
    status,
    errorCode = null,
    message = null,
  }) => {
    sendWsResponse(connection, {
      type: "status",
      datasourceId,
      status,
      ...(errorCode
        ? {
            errorCode,
          }
        : {}),
      ...(message
        ? {
            message,
          }
        : {}),
      timestamp: new Date().toISOString(),
    });
  };

  const sendError = (connection, {
    datasourceId,
    errorCode,
    message,
  }) => {
    sendWsResponse(connection, {
      type: "error",
      datasourceId,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    });
  };

  const incrementConnectionCountByIp = (ip) => {
    const next = (connectionCountByIp.get(ip) || 0) + 1;
    connectionCountByIp.set(ip, next);
  };

  const decrementConnectionCountByIp = (ip) => {
    const current = connectionCountByIp.get(ip) || 0;
    if (current <= 1) {
      connectionCountByIp.delete(ip);
      return;
    }
    connectionCountByIp.set(ip, current - 1);
  };

  const ensureDashboardCapacity = ({ connection, dashboardId, datasourceId }) => {
    const alreadySubscribedToDashboard = [...connection.subscriptions.values()].some(
      (subscription) =>
        subscription.dashboardId === dashboardId && subscription.datasourceId !== datasourceId
    );
    if (alreadySubscribedToDashboard) {
      return;
    }

    const dashboardConnections = dashboardConnectionRefs.get(dashboardId) || new Set();
    if (
      !dashboardConnections.has(connection.id) &&
      dashboardConnections.size >= REALTIME_MAX_CONNECTIONS_PER_DASHBOARD
    ) {
      throw createClientError(
        429,
        "Realtime dashboard connection limit reached",
        STREAM_ERROR_CODES.RATE_LIMITED
      );
    }
  };

  const attachDashboardRef = ({ connection, dashboardId }) => {
    const dashboardConnections = dashboardConnectionRefs.get(dashboardId) || new Set();
    dashboardConnections.add(connection.id);
    dashboardConnectionRefs.set(dashboardId, dashboardConnections);
  };

  const detachDashboardRefIfUnused = ({ connection, dashboardId }) => {
    const stillUsed = [...connection.subscriptions.values()].some(
      (subscription) => subscription.dashboardId === dashboardId
    );
    if (stillUsed) {
      return;
    }

    const dashboardConnections = dashboardConnectionRefs.get(dashboardId);
    if (!dashboardConnections) {
      return;
    }

    dashboardConnections.delete(connection.id);
    if (dashboardConnections.size === 0) {
      dashboardConnectionRefs.delete(dashboardId);
    }
  };

  const setPublicSubscriptionState = ({ connection, subscription }) => {
    const key = `${connection.id}:${subscription.datasourceId}`;
    if (String(subscription.tokenClaims?.sub || "") !== "public") {
      publicSubscriptions.delete(key);
      return;
    }

    publicSubscriptions.set(key, {
      connectionId: connection.id,
      dashboardId: subscription.dashboardId,
      datasourceId: subscription.datasourceId,
      shareTokenVersion: Number(subscription.tokenClaims.shareTokenVersion) || 0,
      sessionToken: subscription.sessionToken,
    });
  };

  const clearPublicSubscriptionState = ({ connectionId, datasourceId }) => {
    publicSubscriptions.delete(`${connectionId}:${datasourceId}`);
  };

  const buildMqttConnectionKey = (intent) => {
    const credentialHash = crypto
      .createHash("sha256")
      .update(`${intent.username || ""}\0${intent.password || ""}`)
      .digest("hex");
    return `${intent.brokerProfileId || "broker"}:${credentialHash}`;
  };

  const getMqttBrokerConnectionCount = (brokerProfileId) =>
    [...mqttPool.values()].filter((entry) => entry.brokerProfileId === brokerProfileId).length;

  const acquireMqttPoolEntry = ({ intent, resolvedDestination = null }) => {
    const key = buildMqttConnectionKey(intent);
    const existing = mqttPool.get(key);
    if (existing) {
      existing.refCount += 1;
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = null;
      }
      return existing;
    }

    if (
      getMqttBrokerConnectionCount(intent.brokerProfileId) >=
      REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER
    ) {
      throw createClientError(
        429,
        "MQTT broker connection pool limit reached",
        STREAM_ERROR_CODES.RATE_LIMITED
      );
    }

    const tlsOptions =
      intent.tls && typeof intent.tls === "object" && !Array.isArray(intent.tls)
        ? intent.tls
        : {};

    const client = new SimpleMqttClient({
      brokerUrl: intent.brokerUrl,
      username: intent.username || undefined,
      password: intent.password || undefined,
      resolvedAddress: resolvedDestination?.address,
      resolvedFamily: resolvedDestination?.family,
      tlsServername: new URL(intent.brokerUrl).hostname,
      keepaliveSeconds: Math.max(
        5,
        Math.floor(Number(intent.keepaliveSeconds) || REALTIME_MQTT_KEEPALIVE_SECONDS)
      ),
      connectTimeoutMs: REALTIME_CONNECT_TIMEOUT_MS,
      reconnectMinMs: REALTIME_RECONNECT_MIN_MS,
      reconnectMaxMs: REALTIME_RECONNECT_MAX_MS,
      tlsOptions: {
        rejectUnauthorized: !ALLOW_INSECURE_TLS,
        ...tlsOptions,
      },
    });
    client.connect();
    const created = {
      key,
      brokerProfileId: intent.brokerProfileId,
      client,
      refCount: 1,
      topicRefCounts: new Map(),
      idleTimer: null,
    };

    mqttPool.set(key, created);
    return created;
  };

  const releaseMqttPoolEntry = (entry) => {
    entry.refCount -= 1;
    if (entry.refCount > 0) {
      return;
    }

    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }

    entry.idleTimer = setTimeout(() => {
      if (entry.refCount > 0) {
        return;
      }
      mqttPool.delete(entry.key);
      entry.client.end(true);
    }, REALTIME_MQTT_IDLE_DISCONNECT_MS);
  };

  const ensureMqttTopicPolicy = ({ intent }) => {
    const topic = String(intent.topic || "").trim();
    if (!topic) {
      throw createClientError(
        400,
        "MQTT topic is required",
        STREAM_ERROR_CODES.POLICY_BLOCKED
      );
    }

    const brokerAllowlist = normalizeMqttAllowlist(intent.topicAllowlist);
    if (brokerAllowlist.length > 0 && !isMqttTopicAllowed(topic, brokerAllowlist)) {
      throw createClientError(
        403,
        "MQTT topic is blocked by broker policy",
        STREAM_ERROR_CODES.POLICY_BLOCKED
      );
    }

    if (
      REALTIME_MQTT_ALLOWED_TOPICS.length > 0 &&
      !isMqttTopicAllowed(topic, REALTIME_MQTT_ALLOWED_TOPICS)
    ) {
      throw createClientError(
        403,
        "MQTT topic is blocked by gateway policy",
        STREAM_ERROR_CODES.POLICY_BLOCKED
      );
    }

    if (
      IS_PRODUCTION &&
      brokerAllowlist.length === 0 &&
      REALTIME_MQTT_ALLOWED_TOPICS.length === 0
    ) {
      throw createClientError(
        403,
        "MQTT topic allowlist is required in production",
        STREAM_ERROR_CODES.POLICY_BLOCKED
      );
    }
  };

  const createSseAdapter = async ({ intent, onData, onStatus, onError }) => {
    const { target, port, hostname } = parseRealtimeTargetUrl({
      rawTarget: intent.url,
      protocol: "sse",
    });
    const resolvedDestination = await ensureResolvedDestinationIsAllowed(hostname, {
      lookup,
    });

    const idleTimeoutMs =
      Math.max(1000, Number(intent.idleTimeoutMs) || REALTIME_SSE_IDLE_TIMEOUT_MS);

    let upstreamRequest = null;
    let upstreamResponse = null;
    let stopped = false;
    let idleTimer = null;
    let eventBuffer = "";

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.IDLE_TIMEOUT, "SSE stream idle timeout");
        stop();
      }, idleTimeoutMs);
    };

    const dispatchSseEvent = (rawEventBlock) => {
      const lines = rawEventBlock.split(/\r?\n/);
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
        }
      }

      if (dataLines.length === 0) {
        return;
      }

      const rawPayload = dataLines.join("\n");
      try {
        const parsedPayload = parseStreamPayload(rawPayload, intent.parser);
        onData(parsedPayload);
      } catch {
        onError(STREAM_ERROR_CODES.PROTOCOL_ERROR, "SSE payload parsing failed");
      }
    };

    const processSseBuffer = () => {
      while (true) {
        const splitCandidates = [
          eventBuffer.indexOf("\r\n\r\n"),
          eventBuffer.indexOf("\n\n"),
        ].filter((value) => value >= 0);

        if (splitCandidates.length === 0) {
          break;
        }

        const splitIndex = Math.min(...splitCandidates);
        const delimiterLength = eventBuffer.startsWith("\r\n\r\n", splitIndex) ? 4 : 2;
        const block = eventBuffer.slice(0, splitIndex);
        eventBuffer = eventBuffer.slice(splitIndex + delimiterLength);
        if (Buffer.byteLength(block, "utf8") > REALTIME_MAX_MESSAGE_BYTES) {
          onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "SSE message exceeded size limit");
          stop();
          return false;
        }
        dispatchSseEvent(block);
      }

      if (Buffer.byteLength(eventBuffer, "utf8") > REALTIME_MAX_MESSAGE_BYTES) {
        onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "SSE message exceeded size limit");
        stop();
        return false;
      }

      return true;
    };

    const stop = () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearIdleTimer();
      if (upstreamResponse && !upstreamResponse.destroyed) {
        upstreamResponse.destroy();
      }
      if (upstreamRequest && !upstreamRequest.destroyed) {
        upstreamRequest.destroy();
      }
      onStatus("disconnected");
    };

    const timeoutMs = Math.max(500, REALTIME_CONNECT_TIMEOUT_MS);
    const options = createUpstreamRequestOptions({
      target,
      port,
      hostname,
      resolvedDestination,
      bodyText: "",
      headers: intent.headers,
      timeoutMs,
    });
    options.method = "GET";

    onStatus("connecting");
    resetIdleTimer();

    const requestFn = target.protocol === "https:" ? https.request : http.request;
    upstreamRequest = requestFn(options, (response) => {
      upstreamResponse = response;
      const statusCode = Number(response.statusCode) || 0;
      if (statusCode < 200 || statusCode >= 300) {
        onError(
          statusCode === 401 || statusCode === 403
            ? STREAM_ERROR_CODES.AUTH_FAILED
            : STREAM_ERROR_CODES.CONNECT_REFUSED,
          "SSE upstream rejected connection"
        );
        stop();
        return;
      }

      onStatus("connected");
      resetIdleTimer();

      response.on("data", (chunk) => {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (bufferChunk.byteLength > REALTIME_MAX_MESSAGE_BYTES) {
          onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "SSE message exceeded size limit");
          stop();
          return;
        }

        eventBuffer += bufferChunk.toString("utf8");
        if (!processSseBuffer()) {
          return;
        }
        resetIdleTimer();
      });

      response.on("end", () => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "SSE upstream stream ended");
        stop();
      });

      response.on("error", () => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "SSE upstream stream failed");
        stop();
      });
    });

    upstreamRequest.on("timeout", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_TIMEOUT, "SSE upstream connect timeout");
      stop();
    });

    upstreamRequest.on("error", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_FAILED, "SSE upstream connection failed");
      stop();
    });

    upstreamRequest.end();

    return { stop };
  };

  const createWebSocketAdapter = async ({ intent, onData, onStatus, onError }) => {
    const { hostname } = parseRealtimeTargetUrl({
      rawTarget: intent.url,
      protocol: "websocket",
    });
    const resolvedDestination = await ensureResolvedDestinationIsAllowed(hostname, {
      lookup,
    });

    const idleTimeoutMs =
      Math.max(1000, Number(intent.idleTimeoutMs) || REALTIME_WS_IDLE_TIMEOUT_MS);

    let stopped = false;
    let idleTimer = null;
    let upstreamSocket = null;
    let pingTimer = null;

    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        if (stopped) {
          return;
        }
        onError(STREAM_ERROR_CODES.IDLE_TIMEOUT, "WebSocket upstream idle timeout");
        stop();
      }, idleTimeoutMs);
    };

    const stop = () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearIdleTimer();
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (upstreamSocket) {
        upstreamSocket.removeAllListeners();
        if (upstreamSocket.readyState === WebSocket.OPEN) {
          upstreamSocket.close(1000, "subscription ended");
        } else {
          upstreamSocket.terminate();
        }
      }
      onStatus("disconnected");
    };

    onStatus("connecting");
    resetIdleTimer();

    upstreamSocket = wsClientFactory(intent.url, intent.protocols || [], {
      headers: normalizeRequestHeaders(intent.headers),
      handshakeTimeout: REALTIME_CONNECT_TIMEOUT_MS,
      rejectUnauthorized: !ALLOW_INSECURE_TLS,
      servername: hostname,
      lookup: (_unusedHostname, _unusedOptions, callback) => {
        callback(null, resolvedDestination.address, resolvedDestination.family);
      },
    });

    upstreamSocket.on("open", () => {
      if (stopped) {
        return;
      }
      onStatus("connected");
      resetIdleTimer();
      pingTimer = setInterval(() => {
        if (!upstreamSocket || upstreamSocket.readyState !== WebSocket.OPEN) {
          return;
        }
        upstreamSocket.ping();
      }, REALTIME_WS_PING_INTERVAL_MS);
    });

    upstreamSocket.on("message", (payload, isBinary) => {
      if (stopped) {
        return;
      }

      const payloadBuffer = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(payload);
      if (payloadBuffer.byteLength > REALTIME_MAX_MESSAGE_BYTES) {
        onError(
          STREAM_ERROR_CODES.MESSAGE_TOO_LARGE,
          "WebSocket message exceeded size limit"
        );
        return;
      }

      const textPayload =
        isBinary || Buffer.isBuffer(payload) ? payloadBuffer.toString("utf8") : String(payload);
      try {
        const parsedPayload = parseStreamPayload(textPayload, intent.parser);
        onData(parsedPayload);
      } catch {
        onError(STREAM_ERROR_CODES.PROTOCOL_ERROR, "WebSocket payload parsing failed");
      }
      resetIdleTimer();
    });

    upstreamSocket.on("pong", () => {
      if (!stopped) {
        resetIdleTimer();
      }
    });

    upstreamSocket.on("error", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_FAILED, "WebSocket upstream connection failed");
      stop();
    });

    upstreamSocket.on("close", () => {
      if (stopped) {
        return;
      }
      onError(STREAM_ERROR_CODES.CONNECT_FAILED, "WebSocket upstream disconnected");
      stop();
    });

    return { stop };
  };

  const createMqttAdapter = async ({ intent, onData, onStatus, onError }) => {
    parseRealtimeTargetUrl({ rawTarget: intent.brokerUrl, protocol: "mqtt" });
    const mqttUrl = new URL(intent.brokerUrl);
    const resolvedDestination = await ensureResolvedDestinationIsAllowed(mqttUrl.hostname, {
      lookup,
    });

    ensureMqttTopicPolicy({ intent });

    const qos = Math.max(
      0,
      Math.min(
        REALTIME_MQTT_MAX_QOS,
        Math.floor(Number(intent.qos) || 0)
      )
    );

    const poolEntry = acquireMqttPoolEntry({
      intent,
      resolvedDestination,
    });
    const topic = String(intent.topic || "").trim();

    let stopped = false;

    const incrementTopicRef = async () => {
      const current = poolEntry.topicRefCounts.get(topic) || 0;
      if (current > 0) {
        poolEntry.topicRefCounts.set(topic, current + 1);
        return;
      }

      poolEntry.topicRefCounts.set(topic, 1);
      await new Promise((resolve, reject) => {
        poolEntry.client.subscribe(topic, { qos }, (error) => {
          if (error) {
            poolEntry.topicRefCounts.delete(topic);
            reject(
              createClientError(
                502,
                "MQTT subscribe failed",
                STREAM_ERROR_CODES.CONNECT_FAILED
              )
            );
            return;
          }
          resolve();
        });
      });
    };

    const decrementTopicRef = async () => {
      const current = poolEntry.topicRefCounts.get(topic) || 0;
      if (current <= 1) {
        poolEntry.topicRefCounts.delete(topic);
        await new Promise((resolve) => {
          poolEntry.client.unsubscribe(topic, () => resolve());
        });
        return;
      }

      poolEntry.topicRefCounts.set(topic, current - 1);
    };

    const onConnect = () => {
      if (!stopped) {
        onStatus("connected");
      }
    };

    const onClose = () => {
      if (!stopped) {
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "MQTT broker disconnected");
      }
    };

    const onPoolError = () => {
      if (!stopped) {
        onError(STREAM_ERROR_CODES.CONNECT_FAILED, "MQTT broker connection failed");
      }
    };

    const onMessage = (messageTopic, payload) => {
      if (stopped || messageTopic !== topic) {
        return;
      }

      const payloadBuffer = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(payload);
      if (payloadBuffer.byteLength > REALTIME_MQTT_MAX_MESSAGE_BYTES) {
        onError(STREAM_ERROR_CODES.MESSAGE_TOO_LARGE, "MQTT payload exceeded size limit");
        return;
      }

      try {
        const parsedPayload = parseStreamPayload(
          payloadBuffer.toString("utf8"),
          intent.parser
        );
        onData(parsedPayload);
      } catch {
        onError(STREAM_ERROR_CODES.PROTOCOL_ERROR, "MQTT payload parsing failed");
      }
    };

    onStatus("connecting");

    poolEntry.client.on("connect", onConnect);
    poolEntry.client.on("close", onClose);
    poolEntry.client.on("error", onPoolError);
    poolEntry.client.on("message", onMessage);

    try {
      await incrementTopicRef();
      if (poolEntry.client.connected) {
        onStatus("connected");
      }
    } catch (error) {
      poolEntry.client.off("connect", onConnect);
      poolEntry.client.off("close", onClose);
      poolEntry.client.off("error", onPoolError);
      poolEntry.client.off("message", onMessage);
      releaseMqttPoolEntry(poolEntry);
      throw error;
    }

    const stop = async () => {
      if (stopped) {
        return;
      }
      stopped = true;

      poolEntry.client.off("connect", onConnect);
      poolEntry.client.off("close", onClose);
      poolEntry.client.off("error", onPoolError);
      poolEntry.client.off("message", onMessage);

      await decrementTopicRef().catch(() => {});
      releaseMqttPoolEntry(poolEntry);
      onStatus("disconnected");
    };

    return { stop };
  };

  const createProtocolAdapter = async ({ intent, onData, onStatus, onError }) => {
    const protocol = String(intent?.protocol || "").toLowerCase();

    if (protocol === "sse") {
      if (!REALTIME_SSE_ENABLED) {
        throw createClientError(
          403,
          "SSE protocol is disabled",
          STREAM_ERROR_CODES.POLICY_BLOCKED
        );
      }
      return createSseAdapter({ intent, onData, onStatus, onError });
    }

    if (protocol === "websocket") {
      if (!REALTIME_WS_ENABLED) {
        throw createClientError(
          403,
          "WebSocket protocol is disabled",
          STREAM_ERROR_CODES.POLICY_BLOCKED
        );
      }
      return createWebSocketAdapter({ intent, onData, onStatus, onError });
    }

    if (protocol === "mqtt") {
      if (!REALTIME_MQTT_ENABLED) {
        throw createClientError(
          403,
          "MQTT protocol is disabled",
          STREAM_ERROR_CODES.POLICY_BLOCKED
        );
      }
      return createMqttAdapter({ intent, onData, onStatus, onError });
    }

    throw createClientError(
      400,
      "Realtime protocol is not supported",
      STREAM_ERROR_CODES.POLICY_BLOCKED
    );
  };

  const removeSubscription = async ({
    connection,
    datasourceId,
    errorCode = null,
    message = null,
  }) => {
    const existing = connection.subscriptions.get(datasourceId);
    if (!existing) {
      return;
    }

    connection.subscriptions.delete(datasourceId);
    clearPublicSubscriptionState({
      connectionId: connection.id,
      datasourceId,
    });
    if (existing.tokenExpiryTimer) {
      clearTimeout(existing.tokenExpiryTimer);
      existing.tokenExpiryTimer = null;
    }

    try {
      await existing.adapter.stop();
    } catch {
      // Best-effort adapter cleanup.
    }

    detachDashboardRefIfUnused({
      connection,
      dashboardId: existing.dashboardId,
    });

    if (errorCode) {
      sendError(connection, {
        datasourceId,
        errorCode,
        message: message || "Subscription ended",
      });
      sendStatus(connection, {
        datasourceId,
        status: "error",
        errorCode,
        message: message || "Subscription ended",
      });
    } else {
      sendStatus(connection, {
        datasourceId,
        status: "disconnected",
      });
    }
  };

  const scheduleSubscriptionTokenExpiry = ({
    connection,
    datasourceId,
    subscription,
  }) => {
    if (subscription.tokenExpiryTimer) {
      clearTimeout(subscription.tokenExpiryTimer);
      subscription.tokenExpiryTimer = null;
    }

    const delayMs = getTokenExpiryDelayMs(subscription?.tokenClaims);
    if (delayMs === null) {
      return;
    }
    if (delayMs <= 0) {
      void removeSubscription({
        connection,
        datasourceId,
        errorCode: STREAM_ERROR_CODES.AUTH_FAILED,
        message: "Datasource session token expired",
      });
      return;
    }

    subscription.tokenExpiryTimer = setTimeout(() => {
      subscription.tokenExpiryTimer = null;
      void removeSubscription({
        connection,
        datasourceId,
        errorCode: STREAM_ERROR_CODES.AUTH_FAILED,
        message: "Datasource session token expired",
      });
    }, delayMs);
    subscription.tokenExpiryTimer.unref?.();
  };

  const cleanupConnection = async (connection) => {
    const subscriptions = [...connection.subscriptions.keys()];
    await Promise.all(
      subscriptions.map((datasourceId) =>
        removeSubscription({
          connection,
          datasourceId,
        })
      )
    );

    connectionsById.delete(connection.id);
    decrementConnectionCountByIp(connection.ip);
  };

  const handlePublicSubscriptionRateLimit = ({ connection, dashboardId, tokenClaims }) => {
    const ipBucket = consumeRateLimit(
      `realtime-public-subscribe-ip:${connection.ip}`,
      REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN
    );
    if (!ipBucket.allowed) {
      throw createClientError(
        429,
        "Too many public realtime subscribe requests",
        STREAM_ERROR_CODES.RATE_LIMITED
      );
    }

    const shareVersion = Math.max(0, Math.floor(Number(tokenClaims.shareTokenVersion) || 0));
    const shareBucket = consumeRateLimit(
      `realtime-public-subscribe-share:${dashboardId}:${shareVersion}`,
      REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN
    );
    if (!shareBucket.allowed) {
      throw createClientError(
        429,
        "Too many public realtime subscribe requests",
        STREAM_ERROR_CODES.RATE_LIMITED
      );
    }
  };

  const handleSubscribe = async ({ connection, message }) => {
    const requestId = String(message.requestId || "").trim();
    const dashboardId = String(message.dashboardId || "").trim();
    const datasourceId = String(message.datasourceId || "").trim();
    const sessionToken = String(message.sessionToken || "").trim();

    if (!requestId || !dashboardId || !datasourceId || !sessionToken) {
      sendAck(connection, {
        requestId: requestId || null,
        datasourceId: datasourceId || null,
        ok: false,
        errorCode: STREAM_ERROR_CODES.PROTOCOL_ERROR,
        message: "subscribe requires requestId, dashboardId, datasourceId, and sessionToken",
      });
      return;
    }

    if (connection.pendingSubscriptions.has(datasourceId)) {
      sendAck(connection, {
        requestId,
        datasourceId,
        ok: false,
        errorCode: STREAM_ERROR_CODES.RATE_LIMITED,
        message: "Subscription update already in progress",
      });
      return;
    }

    const existing = connection.subscriptions.get(datasourceId);
    if (!existing && connection.subscriptions.size >= REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION) {
      sendAck(connection, {
        requestId,
        datasourceId,
        ok: false,
        errorCode: STREAM_ERROR_CODES.RATE_LIMITED,
        message: "Realtime subscription limit reached for this connection",
      });
      return;
    }

    connection.pendingSubscriptions.add(datasourceId);

    try {
      const tokenClaims = validateSessionToken(sessionToken, {
        expectedScope: "datasource:stream",
      });

      if (
        String(tokenClaims.dashboardId || "") !== dashboardId ||
        String(tokenClaims.datasourceId || "") !== datasourceId
      ) {
        throw createClientError(
          403,
          "Datasource identifiers do not match token claims",
          STREAM_ERROR_CODES.AUTH_FAILED
        );
      }

      if (String(tokenClaims.sub || "") === "public") {
        handlePublicSubscriptionRateLimit({
          connection,
          dashboardId,
          tokenClaims,
        });
      }

      const introspection = await fetchIntrospection({
        sessionToken,
        dashboardId,
        datasourceId,
        fetchFn,
      });

      if (String(introspection?.scope || "") !== "datasource:stream") {
        throw createClientError(
          403,
          "Datasource token scope mismatch",
          STREAM_ERROR_CODES.AUTH_FAILED
        );
      }

      const intent = introspection?.intent;
      if (!intent || typeof intent !== "object") {
        throw createClientError(
          502,
          "Introspection payload is invalid",
          STREAM_ERROR_CODES.CONNECT_FAILED
        );
      }

      if (existing) {
        if (existing.dashboardId !== dashboardId) {
          throw createClientError(
            403,
            "Datasource token dashboard mismatch",
            STREAM_ERROR_CODES.AUTH_FAILED
          );
        }

        const existingIntentHash = String(existing.tokenClaims.intentHash || "").trim();
        const nextIntentHash = String(tokenClaims.intentHash || "").trim();
        if (existingIntentHash && nextIntentHash && existingIntentHash !== nextIntentHash) {
          throw createClientError(
            403,
            "Datasource token intent mismatch",
            STREAM_ERROR_CODES.AUTH_FAILED
          );
        }

        existing.sessionToken = sessionToken;
        existing.tokenClaims = tokenClaims;
        existing.introspection = introspection;
        setPublicSubscriptionState({
          connection,
          subscription: existing,
        });
        scheduleSubscriptionTokenExpiry({
          connection,
          datasourceId,
          subscription: existing,
        });

        sendAck(connection, {
          requestId,
          datasourceId,
          ok: true,
        });
        return;
      }

      ensureDashboardCapacity({
        connection,
        dashboardId,
        datasourceId,
      });

      const nextSubscription = {
        dashboardId,
        datasourceId,
        sessionToken,
        tokenClaims,
        introspection,
        adapter: null,
        tokenExpiryTimer: null,
      };

      const adapter = await createProtocolAdapter({
        intent,
        onData: (payload) => {
          const envelope = {
            type: "data",
            datasourceId,
            payload,
            timestamp: new Date().toISOString(),
          };

          if (!sendWsResponse(connection, envelope)) {
            sendError(connection, {
              datasourceId,
              errorCode: STREAM_ERROR_CODES.MESSAGE_TOO_LARGE,
              message: "Realtime payload exceeded message limit",
            });
          }
        },
        onStatus: (status) => {
          sendStatus(connection, {
            datasourceId,
            status,
          });
        },
        onError: (errorCode, messageText) => {
          sendError(connection, {
            datasourceId,
            errorCode,
            message: messageText,
          });
          sendStatus(connection, {
            datasourceId,
            status: "error",
            errorCode,
            message: messageText,
          });
        },
      });

      nextSubscription.adapter = adapter;
      connection.subscriptions.set(datasourceId, nextSubscription);
      attachDashboardRef({ connection, dashboardId });
      setPublicSubscriptionState({
        connection,
        subscription: nextSubscription,
      });
      scheduleSubscriptionTokenExpiry({
        connection,
        datasourceId,
        subscription: nextSubscription,
      });

      sendAck(connection, {
        requestId,
        datasourceId,
        ok: true,
      });
    } catch (error) {
      sendAck(connection, {
        requestId,
        datasourceId,
        ok: false,
        errorCode: mapStreamErrorCode(error),
        message: sanitizeErrorMessage(error, "Subscription failed"),
      });
    } finally {
      connection.pendingSubscriptions.delete(datasourceId);
    }
  };

  const handleUnsubscribe = async ({ connection, message }) => {
    const requestId = String(message.requestId || "").trim();
    const datasourceId = String(message.datasourceId || "").trim();

    if (!requestId || !datasourceId) {
      sendAck(connection, {
        requestId: requestId || null,
        datasourceId: datasourceId || null,
        ok: false,
        errorCode: STREAM_ERROR_CODES.PROTOCOL_ERROR,
        message: "unsubscribe requires requestId and datasourceId",
      });
      return;
    }

    await removeSubscription({ connection, datasourceId });
    sendAck(connection, {
      requestId,
      datasourceId,
      ok: true,
    });
  };

  const handlePing = ({ connection, message }) => {
    sendWsResponse(connection, {
      type: "pong",
      requestId: message.requestId || null,
      timestamp: new Date().toISOString(),
    });
  };

  const fullRevalidatePublicSubscriptions = async () => {
    const snapshot = [...publicSubscriptions.values()];
    for (const publicSubscription of snapshot) {
      const connection = connectionsById.get(publicSubscription.connectionId);
      if (!connection) {
        continue;
      }

      try {
        const introspection = await fetchIntrospection({
          sessionToken: publicSubscription.sessionToken,
          dashboardId: publicSubscription.dashboardId,
          datasourceId: publicSubscription.datasourceId,
          fetchFn,
        });

        if (String(introspection?.scope || "") !== "datasource:stream") {
          throw createClientError(403, "Datasource token scope mismatch");
        }
      } catch {
        await removeSubscription({
          connection,
          datasourceId: publicSubscription.datasourceId,
          errorCode: STREAM_ERROR_CODES.AUTH_FAILED,
          message: "Public stream authorization was revoked",
        });
      }
    }
  };

  const pollRevokedTokens = async () => {
    if (pollingRevocations || publicSubscriptions.size === 0) {
      return;
    }

    pollingRevocations = true;
    try {
      const feed = await fetchRevokedTokens({
        sinceCursor: revocationCursor,
        limit: REVOKED_TOKENS_MAX_BATCH,
        fetchFn,
      });

      if (feed?.nextCursor) {
        revocationCursor = feed.nextCursor;
      }

      if (feed?.cursorExpired) {
        await fullRevalidatePublicSubscriptions();
      }

      const events = Array.isArray(feed?.events) ? feed.events : [];
      for (const event of events) {
        const dashboardId = String(event?.dashboardId || "").trim();
        const revokedVersion = Math.max(
          0,
          Math.floor(Number(event?.shareTokenVersion) || 0)
        );

        for (const activePublicSubscription of [...publicSubscriptions.values()]) {
          if (activePublicSubscription.dashboardId !== dashboardId) {
            continue;
          }

          if (activePublicSubscription.shareTokenVersion >= revokedVersion) {
            continue;
          }

          const connection = connectionsById.get(activePublicSubscription.connectionId);
          if (!connection) {
            continue;
          }

          await removeSubscription({
            connection,
            datasourceId: activePublicSubscription.datasourceId,
            errorCode: STREAM_ERROR_CODES.AUTH_FAILED,
            message: "Public stream authorization was revoked",
          });
        }
      }
    } catch (error) {
      console.warn(
        "Realtime gateway warning: revoked token polling failed",
        error?.message || error
      );
    } finally {
      pollingRevocations = false;
    }
  };

  const revocationPollTimer = setInterval(() => {
    void pollRevokedTokens();
  }, REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS);

  const fullRevalidateTimer = setInterval(() => {
    void fullRevalidatePublicSubscriptions();
  }, REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS);

  wss.on("connection", (ws, request) => {
    const clientIp = ws.__clientIp || deriveClientIp(request);
    const connection = {
      id: crypto.randomUUID(),
      ws,
      ip: clientIp,
      subscriptions: new Map(),
      pendingSubscriptions: new Set(),
    };

    connectionsById.set(connection.id, connection);
    incrementConnectionCountByIp(clientIp);

    ws.on("message", (rawPayload, isBinary) => {
      const payloadBuffer = Buffer.isBuffer(rawPayload)
        ? rawPayload
        : Buffer.from(rawPayload);
      if (payloadBuffer.byteLength > REALTIME_MAX_MESSAGE_BYTES) {
        sendError(connection, {
          datasourceId: null,
          errorCode: STREAM_ERROR_CODES.MESSAGE_TOO_LARGE,
          message: "Realtime message exceeded size limit",
        });
        ws.close(1009, "message too large");
        return;
      }

      const rawText = isBinary
        ? payloadBuffer.toString("utf8")
        : String(rawPayload);

      let message;
      try {
        message = JSON.parse(rawText);
      } catch {
        sendError(connection, {
          datasourceId: null,
          errorCode: STREAM_ERROR_CODES.PROTOCOL_ERROR,
          message: "Malformed realtime message",
        });
        return;
      }

      const type = String(message?.type || "").trim().toLowerCase();
      if (type === "subscribe") {
        void handleSubscribe({ connection, message });
        return;
      }
      if (type === "unsubscribe") {
        void handleUnsubscribe({ connection, message });
        return;
      }
      if (type === "ping") {
        handlePing({ connection, message });
        return;
      }

      sendError(connection, {
        datasourceId: String(message?.datasourceId || "").trim() || null,
        errorCode: STREAM_ERROR_CODES.PROTOCOL_ERROR,
        message: "Unsupported realtime message type",
      });
    });

    ws.on("close", () => {
      void cleanupConnection(connection);
    });

    ws.on("error", () => {
      void cleanupConnection(connection);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname !== "/gateway/realtime") {
      socket.destroy();
      return;
    }

    if (!REALTIME_ENABLED) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const clientIp = deriveClientIp(request);

    const connectRateLimit = consumeRateLimit(
      `realtime-connect:${clientIp}`,
      REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN
    );
    if (!connectRateLimit.allowed) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    const activeConnectionsForIp = connectionCountByIp.get(clientIp) || 0;
    if (activeConnectionsForIp >= REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.__clientIp = clientIp;
      wss.emit("connection", ws, request);
    });
  });

  return {
    wss,
    close: async () => {
      clearInterval(revocationPollTimer);
      clearInterval(fullRevalidateTimer);

      await Promise.all(
        [...connectionsById.values()].map((connection) => cleanupConnection(connection))
      );

      for (const entry of mqttPool.values()) {
        if (entry.idleTimer) {
          clearTimeout(entry.idleTimer);
        }
        entry.client.end(true);
      }
      mqttPool.clear();

      await new Promise((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
};

/**
 * Create and configure the gateway Express app.
 *
 * @param {{lookup?: Function, fetchFn?: Function}} [options]
 * @returns {import('express').Express}
 */
export const createGatewayApp = ({
  lookup = dns.promises.lookup,
  fetchFn = fetch,
} = {}) => {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  const handler = createGatewayFetchHandler({ lookup, fetchFn });
  app.post("/gateway/http/fetch", handler);

  return app;
};

/**
 * Start gateway HTTP server.
 *
 * @param {{port?: number, host?: string, lookup?: Function, fetchFn?: Function}} [options]
 * @returns {import('http').Server}
 */
export const startGatewayServer = ({
  port = PORT,
  host = HOST,
  lookup = dns.promises.lookup,
  fetchFn = fetch,
} = {}) => {
  const app = createGatewayApp({ lookup, fetchFn });
  const server = http.createServer(app);
  const realtimeGateway = createRealtimeGateway({
    server,
    lookup,
    fetchFn,
  });

  server.listen(port, host, () => {
    const printableHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
    console.log(`Gateway listening on http://${printableHost}:${port}`);
  });

  server.on("close", () => {
    void realtimeGateway.close();
  });

  return server;
};

const currentModulePath = fileURLToPath(import.meta.url);
const currentProcessEntry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentProcessEntry && currentProcessEntry === currentModulePath) {
  startGatewayServer();
}
