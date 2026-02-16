/**
 * @module datasourceGateway
 * @description Canonical datasource intent + session token helpers for API/gateway trust flow.
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import CredentialProfile from "./models/CredentialProfile.js";
import User from "./models/User.js";

const EXTERNAL_VISIBILITIES = new Set(["link", "public"]);
const ALLOWED_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_HTTP_PARSERS = new Set(["json", "text", "csv"]);

export const DATASOURCE_SESSION_TTL_SECONDS = 300;

const toComparableId = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

export const createClientError = (statusCode, message, code = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
};

const parseJsonObjectSetting = (value) => {
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

const sanitizeCustomHeaders = (inputHeaders = {}) => {
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

const normalizeHttpMethod = (value) => {
  const method = String(value || "GET").trim().toUpperCase();
  return ALLOWED_HTTP_METHODS.has(method) ? method : "GET";
};

const normalizeHttpParser = (value) => {
  const parser = String(value || "json").trim().toLowerCase();
  return ALLOWED_HTTP_PARSERS.has(parser) ? parser : "json";
};

const normalizeTimeout = (value) => {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120000) {
    return config.fetchTimeoutMs;
  }
  return Math.floor(timeout);
};

const resolveCredentialHeaders = ({ profile, secret }) => {
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

export const findDashboardDatasource = (dashboard, datasourceId) => {
  const targetDatasourceId = toComparableId(datasourceId);
  const datasources = Array.isArray(dashboard?.datasources) ? dashboard.datasources : [];
  const datasource =
    datasources.find((entry) => toComparableId(entry?.id) === targetDatasourceId) ||
    null;

  if (!datasource) {
    throw createClientError(404, "Datasource not found", "DATASOURCE_NOT_FOUND");
  }

  if (String(datasource.type || "").toLowerCase() !== "http") {
    throw createClientError(400, "Datasource type is not supported by gateway", "UNSUPPORTED_DATASOURCE");
  }

  return datasource;
};

const resolveAclAccess = (dashboard, userId) => {
  const normalizedUserId = toComparableId(userId);
  const entries = Array.isArray(dashboard?.acl) ? dashboard.acl : [];
  return (
    entries.find((entry) => toComparableId(entry?.userId) === normalizedUserId) || null
  );
};

const canUserReadDashboard = ({ dashboard, user }) => {
  const visibility = String(dashboard?.visibility || "private").toLowerCase();
  if (!user) {
    return visibility === "public";
  }

  const userId = toComparableId(user._id);
  const ownerUserId = toComparableId(dashboard.user);
  const role = String(user.role || "viewer").toLowerCase();
  if (role === "admin") {
    return true;
  }
  if (ownerUserId && userId === ownerUserId) {
    return true;
  }
  if (resolveAclAccess(dashboard, userId)) {
    return true;
  }
  return visibility === "public";
};

const ensureExternalVisibility = (dashboard) => {
  const visibility = String(dashboard?.visibility || "private").toLowerCase();
  if (!EXTERNAL_VISIBILITIES.has(visibility)) {
    throw createClientError(403, "Dashboard is not externally visible", "DASHBOARD_PRIVATE");
  }
  return visibility;
};

const ensurePublicDashboardAllowed = ({ dashboard, shareToken }) => {
  const visibility = ensureExternalVisibility(dashboard);

  if (visibility === "link") {
    const normalizedShareToken = String(shareToken || "").trim();
    if (!normalizedShareToken || normalizedShareToken !== dashboard.shareToken) {
      throw createClientError(403, "Dashboard share token is invalid", "SHARE_TOKEN_INVALID");
    }
  }
};

const normalizeBodyValue = (rawBody) => {
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

export const buildCanonicalDatasourceIntent = async ({ dashboard, datasourceId }) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId);
  const settings = datasource.settings && typeof datasource.settings === "object"
    ? datasource.settings
    : {};

  const targetUrl = String(settings.url || "").trim();
  if (!targetUrl) {
    throw createClientError(400, "Datasource URL is required", "DATASOURCE_URL_REQUIRED");
  }

  const credentialProfileId = String(settings.credentialProfileId || "").trim() || null;
  let credentialProfile = null;
  let credentialSecret = {};

  if (credentialProfileId) {
    credentialProfile = await CredentialProfile.findOne({ _id: credentialProfileId }).lean();
    if (!credentialProfile) {
      throw createClientError(403, "Credential profile not found", "CREDENTIAL_PROFILE_NOT_FOUND");
    }
  }

  const customHeaders = sanitizeCustomHeaders(
    parseJsonObjectSetting(settings.headers || settings.requestHeaders)
  );

  return {
    datasourceId: toComparableId(datasource.id),
    dashboardId: toComparableId(dashboard._id),
    url: targetUrl,
    method: normalizeHttpMethod(settings.method),
    body: normalizeBodyValue(settings.body),
    parser: normalizeHttpParser(settings.parser),
    timeoutMs: normalizeTimeout(settings.timeoutMs),
    headers: customHeaders,
    credentialProfile,
    credentialSecret,
  };
};

const toHashableIntent = (intent) => ({
  dashboardId: intent.dashboardId,
  datasourceId: intent.datasourceId,
  url: intent.url,
  method: intent.method,
  body: intent.body,
  parser: intent.parser,
  timeoutMs: intent.timeoutMs,
  headers: intent.headers,
  credentialProfileId: intent.credentialProfile?._id || null,
});

export const hashDatasourceIntent = (intent) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(toHashableIntent(intent)))
    .digest("hex");

export const mintDatasourceSessionToken = ({
  dashboard,
  datasourceId,
  user = null,
  shareToken = null,
}) => {
  const userRole = String(user?.role || "").toLowerCase();
  const isPublicFlow = !user;

  if (isPublicFlow) {
    ensurePublicDashboardAllowed({ dashboard, shareToken });
  } else if (!canUserReadDashboard({ dashboard, user })) {
    throw createClientError(403, "Dashboard access denied", "FORBIDDEN");
  }

  const datasource = findDashboardDatasource(dashboard, datasourceId);
  const credentialProfileId =
    String(datasource?.settings?.credentialProfileId || "").trim() || null;

  const intentHash = hashDatasourceIntent({
    dashboardId: toComparableId(dashboard._id),
    datasourceId: toComparableId(datasource.id),
    url: String(datasource?.settings?.url || "").trim(),
    method: normalizeHttpMethod(datasource?.settings?.method),
    body: normalizeBodyValue(datasource?.settings?.body),
    parser: normalizeHttpParser(datasource?.settings?.parser),
    timeoutMs: normalizeTimeout(datasource?.settings?.timeoutMs),
    headers: sanitizeCustomHeaders(
      parseJsonObjectSetting(datasource?.settings?.headers || datasource?.settings?.requestHeaders)
    ),
    credentialProfile: credentialProfileId ? { _id: credentialProfileId } : null,
  });

  const nowEpoch = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = nowEpoch + DATASOURCE_SESSION_TTL_SECONDS;
  const shareTokenVersion = Number.isFinite(Number(dashboard.shareTokenVersion))
    ? Math.max(0, Math.floor(Number(dashboard.shareTokenVersion)))
    : 0;

  const payload = {
    iss: "freeboard-api",
    aud: "freeboard-gateway",
    sub: isPublicFlow ? "public" : toComparableId(user._id),
    jti: crypto.randomUUID(),
    dashboardId: toComparableId(dashboard._id),
    datasourceId: toComparableId(datasource.id),
    credentialProfileId,
    intentHash,
    shareTokenVersion: isPublicFlow ? shareTokenVersion : null,
    scope: "datasource:fetch",
    role: isPublicFlow ? "public" : userRole,
    iat: nowEpoch,
    exp: expiresAtEpoch,
  };

  const token = jwt.sign(payload, config.jwtGatewaySecret, {
    algorithm: "HS256",
  });

  return {
    token,
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
};

export const validateDatasourceSessionToken = (token) => {
  try {
    return jwt.verify(token, config.jwtGatewaySecret, {
      algorithms: ["HS256"],
      audience: "freeboard-gateway",
      issuer: "freeboard-api",
    });
  } catch {
    throw createClientError(401, "Invalid or expired datasource session token", "TOKEN_INVALID");
  }
};

export const resolveGatewayIntrospection = async ({
  dashboard,
  datasourceId,
  tokenClaims,
  decryptSecret,
}) => {
  const canonicalIntent = await buildCanonicalDatasourceIntent({ dashboard, datasourceId });
  const expectedIntentHash = hashDatasourceIntent(canonicalIntent);

  if (expectedIntentHash !== tokenClaims.intentHash) {
    throw createClientError(403, "Datasource intent mismatch", "INTENT_MISMATCH");
  }

  if (String(tokenClaims.sub || "") === "public") {
    ensureExternalVisibility(dashboard);
    const dashboardShareTokenVersion = Number.isFinite(Number(dashboard.shareTokenVersion))
      ? Math.max(0, Math.floor(Number(dashboard.shareTokenVersion)))
      : 0;
    if (Number(tokenClaims.shareTokenVersion) !== dashboardShareTokenVersion) {
      throw createClientError(403, "Share token is stale", "SHARE_TOKEN_STALE");
    }
  } else {
    const user = await User.findOne({ _id: tokenClaims.sub, active: true }).lean();
    if (!user || !canUserReadDashboard({ dashboard, user })) {
      throw createClientError(403, "Dashboard access denied", "FORBIDDEN");
    }
  }

  let credentialHeaders = {};
  if (canonicalIntent.credentialProfile) {
    const profile = canonicalIntent.credentialProfile;
    const secret = decryptSecret(profile.secret);

    if (
      String(tokenClaims.sub || "") === "public" &&
      profile.allowPublicUse !== true
    ) {
      throw createClientError(
        403,
        "Credential profile does not allow public usage",
        "CREDENTIAL_PUBLIC_FORBIDDEN"
      );
    }

    credentialHeaders = resolveCredentialHeaders({
      profile,
      secret,
    });
  }

  return {
    dashboardId: canonicalIntent.dashboardId,
    datasourceId: canonicalIntent.datasourceId,
    credentialProfileId: canonicalIntent.credentialProfile?._id || null,
    intent: {
      url: canonicalIntent.url,
      method: canonicalIntent.method,
      body: canonicalIntent.body,
      parser: canonicalIntent.parser,
      timeoutMs: canonicalIntent.timeoutMs,
      headers: {
        ...canonicalIntent.headers,
        ...credentialHeaders,
      },
    },
  };
};
