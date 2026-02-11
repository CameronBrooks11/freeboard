/**
 * @module proxy/index
 * @description HTTP proxy service to bypass CORS with SSRF-oriented safeguards.
 *  - Supports IPv4-first DNS resolution to avoid IPv6 localhost issues
 *  - Restricts destination protocol/host/port with allowlist and private-network checks
 *  - Uses secure TLS verification by default
 *  - Forwards only minimal safe request headers
 */

import "dotenv/config";
import * as http from "http";
import * as https from "https";
import express from "express";
import bodyParser from "body-parser";
import dns from "dns";
import net from "net";
import { URL } from "url";

/** @typedef {Object} ExpressRequest */
/** @typedef {Object} ExpressResponse */

/**
 * Force DNS resolution to prefer IPv4 to avoid IPv6 (::1) binding issues.
 */
dns.setDefaultResultOrder?.("ipv4first");

/**
 * Port the proxy server listens on.
 * @constant {number}
 */
const PORT = Number(process.env.PORT || 8001);

/**
 * Host address the proxy server binds to.
 * @constant {string}
 */
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";
const ALLOW_INSECURE_TLS = process.env.PROXY_ALLOW_INSECURE_TLS === "true";
const ALLOW_PRIVATE_DESTINATIONS =
  process.env.PROXY_ALLOW_PRIVATE_DESTINATIONS === "true";
const REQUEST_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 15000);
const MAX_RESPONSE_BYTES = Number(
  process.env.PROXY_MAX_RESPONSE_BYTES || 5 * 1024 * 1024
);
const ALLOWED_HOST_PATTERNS = String(process.env.PROXY_ALLOWED_HOSTS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_PORTS = String(process.env.PROXY_ALLOWED_PORTS || "80,443")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535);

const app = express();

// Parse all request bodies as text for proxy forwarding
app.use(bodyParser.text({ type: "*/*" }));

if (IS_PRODUCTION && ALLOW_INSECURE_TLS) {
  throw new Error("PROXY_ALLOW_INSECURE_TLS=true is not allowed in production.");
}

if (IS_PRODUCTION && ALLOWED_HOST_PATTERNS.length === 0) {
  throw new Error(
    "PROXY_ALLOWED_HOSTS must be configured in production (comma-separated host allowlist)."
  );
}

const blockedIpv4Ranges = [
  { start: "0.0.0.0", end: "0.255.255.255" }, // Current network
  { start: "10.0.0.0", end: "10.255.255.255" }, // Private
  { start: "100.64.0.0", end: "100.127.255.255" }, // CGNAT
  { start: "127.0.0.0", end: "127.255.255.255" }, // Loopback
  { start: "169.254.0.0", end: "169.254.255.255" }, // Link-local
  { start: "172.16.0.0", end: "172.31.255.255" }, // Private
  { start: "192.0.0.0", end: "192.0.0.255" }, // IETF Protocol Assignments
  { start: "192.0.2.0", end: "192.0.2.255" }, // TEST-NET-1
  { start: "192.168.0.0", end: "192.168.255.255" }, // Private
  { start: "198.18.0.0", end: "198.19.255.255" }, // Benchmark testing
  { start: "198.51.100.0", end: "198.51.100.255" }, // TEST-NET-2
  { start: "203.0.113.0", end: "203.0.113.255" }, // TEST-NET-3
  { start: "224.0.0.0", end: "239.255.255.255" }, // Multicast
  { start: "240.0.0.0", end: "255.255.255.255" }, // Reserved
];

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
    return true; // Unique local addresses
  }

  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) {
    return true; // Link-local subset
  }

  if (normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // Link-local subset
  }

  if (normalized.startsWith("ff")) {
    return true; // Multicast
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

  // Block single-label internal names (e.g. "mongo", "kubernetes").
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
    // In development, an empty allowlist means "allow any public host".
    return !IS_PRODUCTION;
  }

  return ALLOWED_HOST_PATTERNS.some((pattern) =>
    hostMatchesPattern(hostname, pattern)
  );
};

const hasAllowedPort = (port) => ALLOWED_PORTS.includes(port);

const parseTargetUrl = (clientReq) => {
  const requestUrl = new URL(
    clientReq.url || "",
    `http://${clientReq.headers.host || "localhost"}`
  );
  const rawTarget = requestUrl.searchParams.get("url");
  if (!rawTarget) {
    throw createClientError(400, "Missing required query parameter: url");
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

  return {
    target,
    port,
    hostname,
  };
};

const ensureResolvedDestinationIsAllowed = async (hostname) => {
  const resolved = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw createClientError(502, "Unable to resolve target host");
  }

  if (ALLOW_PRIVATE_DESTINATIONS) {
    return;
  }

  for (const record of resolved) {
    if (isBlockedIpAddress(record.address)) {
      throw createClientError(403, "Target resolves to a blocked address");
    }
  }
};

const createClientError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const writeError = (clientRes, error) => {
  const statusCode = error?.statusCode || 500;
  const message = error?.message || "Proxy request failed";
  if (!clientRes.headersSent) {
    clientRes.status(statusCode).json({ error: message });
  } else {
    clientRes.end();
  }
};

const buildOutgoingHeaders = (clientReq, bodyText) => {
  const headers = {
    accept: clientReq.headers.accept || "*/*",
    "user-agent": "freeboard-proxy/secure",
  };

  const contentType = clientReq.headers["content-type"];
  if (contentType && typeof contentType === "string") {
    headers["content-type"] = contentType;
  }

  if (bodyText) {
    headers["content-length"] = String(Buffer.byteLength(bodyText));
  }

  return headers;
};

const forwardRequestBody = (clientReq, proxyReq) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(String(clientReq.method).toUpperCase())) {
    return;
  }

  const bodyText = typeof clientReq.body === "string" ? clientReq.body : "";
  if (bodyText) {
    proxyReq.write(bodyText);
  }
};

/**
 * Handle incoming proxy requests.
 *
 * Extracts the `url` query parameter, constructs an HTTP(S) request to that URL,
 * and pipes the response back to the client. Supports GET and POST methods.
 *
 * @param {ExpressRequest}  clientReq  - Express request object
 * @param {ExpressResponse} clientRes  - Express response object
 */
const handler = async (clientReq, clientRes) => {
  try {
    const { target, port, hostname } = parseTargetUrl(clientReq);
    await ensureResolvedDestinationIsAllowed(hostname);

    const isHttps = target.protocol === "https:";
    const bodyText = typeof clientReq.body === "string" ? clientReq.body : "";
    const headers = buildOutgoingHeaders(clientReq, bodyText);
    const options = {
      protocol: target.protocol,
      hostname,
      port,
      path: `${target.pathname}${target.search}`,
      method: clientReq.method,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    };

    if (isHttps) {
      options.agent = new https.Agent({
        rejectUnauthorized: !ALLOW_INSECURE_TLS,
        servername: hostname,
      });
    }

    const upstream = (isHttps ? https : http).request(options, (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers };
      delete responseHeaders["set-cookie"];
      delete responseHeaders["set-cookie2"];

      clientRes.writeHead(upstreamRes.statusCode || 502, responseHeaders);

      let totalBytes = 0;
      upstreamRes.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          upstreamRes.destroy(createClientError(502, "Response exceeded proxy size limit"));
          return;
        }
        clientRes.write(chunk);
      });

      upstreamRes.on("end", () => {
        if (!clientRes.writableEnded) {
          clientRes.end();
        }
      });

      upstreamRes.on("error", (error) => {
        writeError(clientRes, error);
      });
    });

    upstream.on("timeout", () => {
      upstream.destroy(createClientError(504, "Upstream request timed out"));
    });

    upstream.on("error", (error) => {
      writeError(clientRes, error);
    });

    forwardRequestBody(clientReq, upstream);
    upstream.end();
  } catch (error) {
    writeError(clientRes, error);
  }
};

// Register proxy endpoints
app.post("/proxy", handler);
app.get("/proxy", handler);

/**
 * Start the Express server.
 */
app.listen(PORT, HOST, () => {
  const printableHost =
    HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
  console.log(`Proxy listening on http://${printableHost}:${PORT}`);
});
