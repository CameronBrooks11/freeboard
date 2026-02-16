/**
 * @module proxy/index
 * @description Datasource gateway service with SSRF controls and API-backed intent introspection.
 */

import "dotenv/config";
import * as http from "http";
import * as https from "https";
import dns from "dns";
import express from "express";
import jwt from "jsonwebtoken";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

dns.setDefaultResultOrder?.("ipv4first");

const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";

const ALLOW_INSECURE_TLS = process.env.EGRESS_ALLOW_INSECURE_TLS === "true";
const ALLOW_PRIVATE_DESTINATIONS =
  process.env.EGRESS_ALLOW_PRIVATE_DESTINATIONS === "true";
const REQUEST_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000);
const MAX_RESPONSE_BYTES = Number(
  process.env.FETCH_MAX_RESPONSE_BYTES || 5 * 1024 * 1024
);
const INTROSPECTION_TIMEOUT_MS = Number(
  process.env.GATEWAY_INTROSPECTION_TIMEOUT_MS || 5000
);
const ALLOWED_HOST_PATTERNS = String(process.env.EGRESS_ALLOWED_HOSTS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_PORTS = String(process.env.EGRESS_ALLOWED_PORTS || "80,443")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535);
const JWT_GATEWAY_SECRET =
  process.env.JWT_GATEWAY_SECRET || "freeboard-gateway-dev-insecure-local-only-secret-32";
const GATEWAY_SERVICE_TOKEN =
  process.env.GATEWAY_SERVICE_TOKEN ||
  "freeboard-gateway-service-dev-token-local-only-32";
const GATEWAY_API_BASE_URL =
  process.env.GATEWAY_API_BASE_URL || "http://127.0.0.1:4001";
const GATEWAY_INTROSPECTION_URL = `${GATEWAY_API_BASE_URL.replace(/\/$/, "")}/internal/gateway/datasource-introspect`;

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
  throw new Error(
    "JWT_GATEWAY_SECRET is missing or too weak for production runtime."
  );
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

const createClientError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const writeError = (clientRes, error) => {
  const statusCode = error?.statusCode || 500;
  const message = statusCode >= 500 ? "Gateway request failed" : error?.message;
  if (!clientRes.headersSent) {
    clientRes.status(statusCode).json({ error: message || "Gateway request failed" });
  } else {
    clientRes.end();
  }
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

  return ALLOWED_HOST_PATTERNS.some((pattern) =>
    hostMatchesPattern(hostname, pattern)
  );
};

const hasAllowedPort = (port) => ALLOWED_PORTS.includes(port);

/**
 * Parse and validate target URL.
 *
 * @param {string} rawTarget
 * @returns {{target: URL, port: number, hostname: string}}
 */
export const parseTargetUrl = (rawTarget) => {
  if (!rawTarget || typeof rawTarget !== "string") {
    throw createClientError(400, "Target URL is required");
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    throw createClientError(400, "Invalid target URL");
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    throw createClientError(400, "Only http and https protocols are allowed");
  }

  if (target.username || target.password) {
    throw createClientError(400, "Credentials in URL are not allowed");
  }

  const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
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

const buildHostHeader = ({ hostname, port, isHttps }) => {
  const defaultPort = isHttps ? 443 : 80;
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
  const hostHeader = buildHostHeader({ hostname, port, isHttps });
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
          upstreamRes.destroy(
            createClientError(502, "Response exceeded fetch size limit")
          );
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

const validateSessionToken = (token) => {
  try {
    return jwt.verify(token, JWT_GATEWAY_SECRET, {
      algorithms: ["HS256"],
      audience: "freeboard-gateway",
      issuer: "freeboard-api",
    });
  } catch {
    throw createClientError(401, "Invalid datasource session token");
  }
};

const fetchIntrospection = async ({ sessionToken, dashboardId, datasourceId, fetchFn = fetch }) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, Math.max(500, INTROSPECTION_TIMEOUT_MS));

  let response;
  try {
    response = await fetchFn(GATEWAY_INTROSPECTION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        sessionToken,
        dashboardId,
        datasourceId,
      }),
      signal: abortController.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createClientError(504, "Introspection request timed out");
    }
    throw createClientError(502, "Introspection request failed");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createClientError(response.status, payload?.error || "Introspection failed");
  }

  return payload;
};

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

      const tokenClaims = validateSessionToken(sessionToken);
      const dashboardId = String(clientReq.body?.dashboardId || tokenClaims.dashboardId || "").trim();
      const datasourceId = String(clientReq.body?.datasourceId || tokenClaims.datasourceId || "").trim();
      if (!dashboardId || !datasourceId) {
        throw createClientError(400, "dashboardId and datasourceId are required");
      }

      if (dashboardId !== String(tokenClaims.dashboardId || "") || datasourceId !== String(tokenClaims.datasourceId || "")) {
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

/**
 * Backward export alias used by existing tests.
 */
export const createProxyHandler = createGatewayFetchHandler;

/**
 * Create and configure the gateway Express app.
 *
 * @param {{lookup?: Function}} [options]
 * @returns {import('express').Express}
 */
export const createProxyApp = ({ lookup = dns.promises.lookup } = {}) => {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  const handler = createGatewayFetchHandler({ lookup });
  app.post("/gateway/http/fetch", handler);

  app.use("/proxy", (_req, res) => {
    res.status(410).json({
      error: "Legacy /proxy endpoint is removed. Use /gateway/http/fetch.",
    });
  });

  return app;
};

/**
 * Start gateway HTTP server.
 *
 * @param {{port?: number, host?: string, lookup?: Function}} [options]
 * @returns {import('http').Server}
 */
export const startProxyServer = ({
  port = PORT,
  host = HOST,
  lookup = dns.promises.lookup,
} = {}) => {
  const app = createProxyApp({ lookup });
  const server = app.listen(port, host, () => {
    const printableHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
    console.log(`Gateway listening on http://${printableHost}:${port}`);
  });
  return server;
};

const currentModulePath = fileURLToPath(import.meta.url);
const currentProcessEntry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentProcessEntry && currentProcessEntry === currentModulePath) {
  startProxyServer();
}
