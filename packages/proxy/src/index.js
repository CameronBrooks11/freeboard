/**
 * @module proxy/index
 * @description HTTP proxy service with SSRF-oriented safeguards and DNS-pinned upstream connections.
 */

import "dotenv/config";
import * as http from "http";
import * as https from "https";
import bodyParser from "body-parser";
import dns from "dns";
import express from "express";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

dns.setDefaultResultOrder?.("ipv4first");

const PORT = Number(process.env.PORT || 8001);
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

if (IS_PRODUCTION && ALLOW_INSECURE_TLS) {
  throw new Error("PROXY_ALLOW_INSECURE_TLS=true is not allowed in production.");
}

if (IS_PRODUCTION && ALLOWED_HOST_PATTERNS.length === 0) {
  throw new Error(
    "PROXY_ALLOWED_HOSTS must be configured in production (comma-separated host allowlist)."
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
  const message = error?.message || "Proxy request failed";
  if (!clientRes.headersSent) {
    clientRes.status(statusCode).json({ error: message });
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
 * Parse and validate target URL from proxy request.
 *
 * @param {import('express').Request} clientReq
 * @returns {{target: URL, port: number, hostname: string}}
 */
export const parseTargetUrl = (clientReq) => {
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

const buildHostHeader = ({ hostname, port, isHttps }) => {
  const defaultPort = isHttps ? 443 : 80;
  if (port === defaultPort) {
    return hostname;
  }
  return `${hostname}:${port}`;
};

const buildOutgoingHeaders = ({ clientReq, bodyText, hostHeader }) => {
  const headers = {
    accept: clientReq.headers.accept || "*/*",
    "user-agent": "freeboard-proxy/secure",
    host: hostHeader,
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
 * Build proxy request handler.
 *
 * @param {{lookup?: Function, httpRequest?: Function, httpsRequest?: Function}} [options]
 * @returns {import('express').RequestHandler}
 */
export const createProxyHandler = ({
  lookup = dns.promises.lookup,
  httpRequest = http.request,
  httpsRequest = https.request,
} = {}) =>
  async (clientReq, clientRes) => {
    try {
      const { target, port, hostname } = parseTargetUrl(clientReq);
      const resolvedDestination = await ensureResolvedDestinationIsAllowed(
        hostname,
        { lookup }
      );
      const isHttps = target.protocol === "https:";
      const bodyText = typeof clientReq.body === "string" ? clientReq.body : "";
      const hostHeader = buildHostHeader({ hostname, port, isHttps });
      const headers = buildOutgoingHeaders({
        clientReq,
        bodyText,
        hostHeader,
      });

      const options = {
        protocol: target.protocol,
        hostname: resolvedDestination.address,
        family: resolvedDestination.family,
        lookup: (_unusedHostname, _unusedOptions, callback) => {
          callback(
            null,
            resolvedDestination.address,
            resolvedDestination.family
          );
        },
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

      const requestFn = isHttps ? httpsRequest : httpRequest;
      const upstream = requestFn(options, (upstreamRes) => {
        const responseHeaders = { ...upstreamRes.headers };
        delete responseHeaders["set-cookie"];
        delete responseHeaders["set-cookie2"];

        clientRes.writeHead(upstreamRes.statusCode || 502, responseHeaders);

        let totalBytes = 0;
        upstreamRes.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            upstreamRes.destroy(
              createClientError(502, "Response exceeded proxy size limit")
            );
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

/**
 * Create and configure the proxy Express app.
 *
 * @param {{lookup?: Function}} [options]
 * @returns {import('express').Express}
 */
export const createProxyApp = ({ lookup = dns.promises.lookup } = {}) => {
  const app = express();
  app.use(bodyParser.text({ type: "*/*" }));

  const handler = createProxyHandler({ lookup });
  app.post("/proxy", handler);
  app.get("/proxy", handler);
  return app;
};

/**
 * Start proxy HTTP server.
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
    console.log(`Proxy listening on http://${printableHost}:${port}`);
  });
  return server;
};

const currentModulePath = fileURLToPath(import.meta.url);
const currentProcessEntry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentProcessEntry && currentProcessEntry === currentModulePath) {
  startProxyServer();
}
