/**
 * @module datasourceGatewayIntentUtils
 * @description Shared normalization/credential helpers for datasource gateway intents.
 */

import { URL } from "url";

const ALLOWED_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_HTTP_PARSERS = new Set(["json", "text", "csv"]);
const ALLOWED_STREAM_PARSERS = new Set(["json", "text"]);
const ALLOWED_AUTH_PLACEMENTS = new Set(["header", "query"]);

export const parseJsonObjectSetting = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
};

export const sanitizeCustomHeaders = (inputHeaders = {}) => {
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(inputHeaders || {})) {
    const key = String(rawKey || "").trim();
    if (!key) {
      continue;
    }
    const value = String(rawValue ?? "");
    normalized[key] = value;
  }
  return normalized;
};

export const normalizeHttpMethod = (value) => {
  const method = String(value || "GET")
    .trim()
    .toUpperCase();
  return ALLOWED_HTTP_METHODS.has(method) ? method : "GET";
};

export const normalizeHttpParser = (value) => {
  const parser = String(value || "json")
    .trim()
    .toLowerCase();
  return ALLOWED_HTTP_PARSERS.has(parser) ? parser : "json";
};

export const normalizeStreamParser = (value) => {
  const parser = String(value || "json")
    .trim()
    .toLowerCase();
  return ALLOWED_STREAM_PARSERS.has(parser) ? parser : "json";
};

export const normalizeTimeout = (value, fallback) => {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120000) {
    return fallback;
  }
  return Math.floor(timeout);
};

export const normalizeKeepaliveSeconds = (value, fallback = 60) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 5 || normalized > 3600) {
    return fallback;
  }
  return Math.floor(normalized);
};

export const normalizeQos = (value) => {
  const qos = Number(value);
  if (!Number.isFinite(qos)) {
    return 0;
  }
  const normalized = Math.floor(qos);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > 1) {
    return 1;
  }
  return normalized;
};

export const normalizeAuthPlacement = (value) => {
  const normalized = String(value || "header")
    .trim()
    .toLowerCase();
  return ALLOWED_AUTH_PLACEMENTS.has(normalized) ? normalized : "header";
};

export const normalizeWebSocketProtocols = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

export const normalizeBodyValue = (rawBody) => {
  if (rawBody === null || rawBody === undefined) {
    return null;
  }
  if (typeof rawBody === "string") {
    return rawBody;
  }
  try {
    return JSON.stringify(rawBody);
  } catch {
    return String(rawBody);
  }
};

export const resolveCredentialHeaders = ({ profile, secret, createClientError }) => {
  if (!profile || profile.type === "none") {
    return {};
  }

  if (profile.type === "bearer") {
    const token = String(secret?.token || "").trim();
    if (!token) {
      throw createClientError(403, "Credential profile is incomplete", "CREDENTIAL_INVALID");
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  if (profile.type === "basic") {
    const username = String(secret?.username || "");
    const password = String(secret?.password || "");
    if (!username || !password) {
      throw createClientError(403, "Credential profile is incomplete", "CREDENTIAL_INVALID");
    }
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
    };
  }

  if (profile.type === "header") {
    const headerName = String(profile.metadata?.headerName || "").trim();
    const headerValue = String(secret?.headerValue || "");
    if (!headerName || !headerValue) {
      throw createClientError(403, "Credential profile is incomplete", "CREDENTIAL_INVALID");
    }
    return {
      [headerName]: headerValue,
    };
  }

  return {};
};

export const resolveQueryCredentialValue = ({ profile, secret, createClientError }) => {
  if (!profile || profile.type === "none") {
    return "";
  }

  if (profile.type === "bearer") {
    const token = String(secret?.token || "").trim();
    if (!token) {
      throw createClientError(403, "Credential profile is incomplete", "CREDENTIAL_INVALID");
    }
    return token;
  }

  if (profile.type === "header") {
    const value = String(secret?.headerValue || "");
    if (!value) {
      throw createClientError(403, "Credential profile is incomplete", "CREDENTIAL_INVALID");
    }
    return value;
  }

  if (profile.type === "basic") {
    throw createClientError(
      400,
      "Basic credential profile cannot be used with query auth placement",
      "CREDENTIAL_QUERY_UNSUPPORTED",
    );
  }

  return "";
};

export const applyQueryCredentialToUrl = ({ rawUrl, paramName, value, createClientError }) => {
  const normalizedParamName = String(paramName || "").trim();
  if (!normalizedParamName) {
    throw createClientError(
      400,
      "queryParamName is required for query auth placement",
      "QUERY_PARAM_REQUIRED",
    );
  }
  const parsed = new URL(rawUrl);
  parsed.searchParams.set(normalizedParamName, value);
  return parsed.toString();
};
