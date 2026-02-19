/**
 * @module gateway/gatewayHttp
 * @description HTTP datasource fetch execution and Express handler.
 */

import * as http from "http";
import * as https from "https";
import dns from "dns";
import type { Request, Response } from "express";
import { ALLOW_INSECURE_TLS, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS } from "./runtimeConfig.js";
import { createClientError, writeError } from "./errors.js";
import {
  ensureResolvedDestinationIsAllowed,
  parseTargetUrl,
  type ResolvedDestination,
} from "./networkPolicy.js";
import { fetchIntrospection, validateSessionToken } from "./gatewayApiClient.js";

type HeaderMap = Record<string, string>;
type LookupFn = (hostname: string, options: dns.LookupAllOptions) => Promise<dns.LookupAddress[]>;

type UpstreamResolvedDestination = {
  address: string;
  family: 4 | 6;
};

type UpstreamRequestOptionsInput = {
  target: URL;
  port: number;
  hostname: string;
  resolvedDestination: UpstreamResolvedDestination;
  bodyText: string;
  headers?: Record<string, unknown>;
  timeoutMs: number;
};

type StreamParser = "json" | "text" | "csv";
type GatewayIntent = {
  url: string;
  method?: string;
  parser?: StreamParser | string;
  headers?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
};

type FetchHandlerDeps = {
  lookup?: LookupFn;
  httpRequest?: typeof http.request;
  httpsRequest?: typeof https.request;
  fetchFn?: typeof fetch;
};

export const normalizeRequestHeaders = (headers: Record<string, unknown> = {}): HeaderMap => {
  const normalized: HeaderMap = {};
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

const buildHostHeader = ({
  hostname,
  port,
  defaultPort,
}: {
  hostname: string;
  port: number;
  defaultPort: number;
}): string => {
  if (port === defaultPort) {
    return hostname;
  }
  return `${hostname}:${port}`;
};

export const createUpstreamRequestOptions = ({
  target,
  port,
  hostname,
  resolvedDestination,
  bodyText,
  headers,
  timeoutMs,
}: UpstreamRequestOptionsInput): http.RequestOptions => {
  const isHttps = target.protocol === "https:";
  const hostHeader = buildHostHeader({
    hostname,
    port,
    defaultPort: isHttps ? 443 : 80,
  });
  const outgoingHeaders: HeaderMap = {
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

  const options: http.RequestOptions = {
    protocol: target.protocol,
    hostname: resolvedDestination.address,
    family: resolvedDestination.family,
    lookup: (
      _unusedHostname: string,
      _unusedOptions: dns.LookupOneOptions,
      callback: (error: Error | null, address: string, family: number) => void,
    ) => {
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

const parseCsv = (csvText: string): Array<Record<string, string>> => {
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
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      item[header] = values[index] ?? "";
    });
    return item;
  });
};

const parseGatewayResponse = ({
  parser,
  payload,
}: {
  parser?: string;
  payload: string;
}): unknown => {
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

export const parseStreamPayload = (raw: string, parser?: string): unknown => {
  const normalizedParser = String(parser || "json").toLowerCase();
  if (normalizedParser === "text") {
    return raw;
  }
  return JSON.parse(raw);
};

const executeIntentFetch = async ({
  intent,
  lookup,
  httpRequest,
  httpsRequest,
}: {
  intent: GatewayIntent;
  lookup: LookupFn;
  httpRequest: typeof http.request;
  httpsRequest: typeof https.request;
}): Promise<unknown> => {
  const { target, port, hostname } = parseTargetUrl(intent.url);
  const resolvedDestination: ResolvedDestination = await ensureResolvedDestinationIsAllowed(
    hostname,
    {
      lookup,
    },
  );
  const bodyText = intent.body === null || intent.body === undefined ? "" : String(intent.body);
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

  const payload = await new Promise<string>((resolve, reject) => {
    const upstream = requestFn(options, (upstreamRes) => {
      const upstreamStatusCode = Number(upstreamRes.statusCode) || 0;
      let totalBytes = 0;
      const chunks: Buffer[] = [];

      upstreamRes.on("data", (chunk: Buffer | string) => {
        const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += normalizedChunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          upstreamRes.destroy(createClientError(502, "Response exceeded fetch size limit"));
          return;
        }
        chunks.push(normalizedChunk);
      });

      upstreamRes.on("end", () => {
        if (upstreamStatusCode < 200 || upstreamStatusCode >= 300) {
          reject(createClientError(502, `Upstream request failed (${upstreamStatusCode})`));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });

      upstreamRes.on("error", (error: unknown) => {
        reject(error);
      });
    });

    upstream.on("timeout", () => {
      upstream.destroy(createClientError(504, "Upstream request timed out"));
    });

    upstream.on("error", (error: unknown) => {
      reject(error);
    });

    if (["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method)) && bodyText) {
      upstream.write(bodyText);
    }
    upstream.end();
  });

  return parseGatewayResponse({
    parser: intent.parser,
    payload,
  });
};

export const createGatewayFetchHandler =
  ({
    lookup = dns.promises.lookup as LookupFn,
    httpRequest = http.request,
    httpsRequest = https.request,
    fetchFn = fetch,
  }: FetchHandlerDeps = {}) =>
  async (clientReq: Request, clientRes: Response): Promise<void> => {
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
        clientReq.body?.dashboardId || tokenClaims.dashboardId || "",
      ).trim();
      const datasourceId = String(
        clientReq.body?.datasourceId || tokenClaims.datasourceId || "",
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

      const intent = introspection.intent;
      if (!intent || typeof intent !== "object") {
        throw createClientError(502, "Introspection payload is invalid");
      }

      const data = await executeIntentFetch({
        intent: intent as GatewayIntent,
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
