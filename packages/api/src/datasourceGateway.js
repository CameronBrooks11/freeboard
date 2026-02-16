/**
 * @module datasourceGateway
 * @description Canonical datasource intent + session token helpers for API/gateway trust flow.
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { URL } from "url";
import { config } from "./config.js";
import BrokerProfile from "./models/BrokerProfile.js";
import CredentialProfile from "./models/CredentialProfile.js";
import User from "./models/User.js";

const EXTERNAL_VISIBILITIES = new Set(["link", "public"]);
const HTTP_DATASOURCE_TYPES = new Set(["http"]);
const STREAM_DATASOURCE_TYPES = new Set(["sse", "websocket", "mqtt"]);
const SUPPORTED_GATEWAY_DATASOURCE_TYPES = new Set([
  ...HTTP_DATASOURCE_TYPES,
  ...STREAM_DATASOURCE_TYPES,
]);
const ALLOWED_HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_HTTP_PARSERS = new Set(["json", "text", "csv"]);
const ALLOWED_STREAM_PARSERS = new Set(["json", "text"]);
const ALLOWED_AUTH_PLACEMENTS = new Set(["header", "query"]);

export const DATASOURCE_SESSION_TTL_SECONDS = Math.max(
  60,
  Math.floor(Number(config.datasourceSessionTtlSeconds) || 300)
);

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

const normalizeStreamParser = (value) => {
  const parser = String(value || "json").trim().toLowerCase();
  return ALLOWED_STREAM_PARSERS.has(parser) ? parser : "json";
};

const normalizeTimeout = (value, fallback) => {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120000) {
    return fallback;
  }
  return Math.floor(timeout);
};

const normalizeKeepaliveSeconds = (value, fallback = 60) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 5 || normalized > 3600) {
    return fallback;
  }
  return Math.floor(normalized);
};

const normalizeQos = (value) => {
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

const normalizeAuthPlacement = (value) => {
  const normalized = String(value || "header").trim().toLowerCase();
  return ALLOWED_AUTH_PLACEMENTS.has(normalized) ? normalized : "header";
};

const normalizeWebSocketProtocols = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
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

const resolveQueryCredentialValue = ({ profile, secret }) => {
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
      "CREDENTIAL_QUERY_UNSUPPORTED"
    );
  }

  return "";
};

const applyQueryCredentialToUrl = ({ rawUrl, paramName, value }) => {
  const normalizedParamName = String(paramName || "").trim();
  if (!normalizedParamName) {
    throw createClientError(
      400,
      "queryParamName is required for query auth placement",
      "QUERY_PARAM_REQUIRED"
    );
  }
  const parsed = new URL(rawUrl);
  parsed.searchParams.set(normalizedParamName, value);
  return parsed.toString();
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

const getDatasourceType = (datasource) =>
  String(datasource?.type || "")
    .trim()
    .toLowerCase();

const resolveScopeFromDatasourceType = (datasourceType) =>
  HTTP_DATASOURCE_TYPES.has(datasourceType)
    ? "datasource:fetch"
    : STREAM_DATASOURCE_TYPES.has(datasourceType)
      ? "datasource:stream"
      : null;

export const findDashboardDatasource = (
  dashboard,
  datasourceId,
  { allowedTypes = SUPPORTED_GATEWAY_DATASOURCE_TYPES } = {}
) => {
  const targetDatasourceId = toComparableId(datasourceId);
  const datasources = Array.isArray(dashboard?.datasources) ? dashboard.datasources : [];
  const datasource =
    datasources.find((entry) => toComparableId(entry?.id) === targetDatasourceId) ||
    null;

  if (!datasource) {
    throw createClientError(404, "Datasource not found", "DATASOURCE_NOT_FOUND");
  }

  const datasourceType = getDatasourceType(datasource);
  if (!allowedTypes.has(datasourceType)) {
    throw createClientError(
      400,
      "Datasource type is not supported by gateway",
      "UNSUPPORTED_DATASOURCE"
    );
  }

  return datasource;
};

export const buildCanonicalDatasourceIntent = async ({ dashboard, datasourceId }) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId, {
    allowedTypes: HTTP_DATASOURCE_TYPES,
  });
  const settings =
    datasource.settings && typeof datasource.settings === "object"
      ? datasource.settings
      : {};

  const targetUrl = String(settings.url || "").trim();
  if (!targetUrl) {
    throw createClientError(400, "Datasource URL is required", "DATASOURCE_URL_REQUIRED");
  }

  const credentialProfileId = String(settings.credentialProfileId || "").trim() || null;
  let credentialProfile = null;
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
    protocol: "http",
    datasourceType: "http",
    datasourceId: toComparableId(datasource.id),
    dashboardId: toComparableId(dashboard._id),
    url: targetUrl,
    method: normalizeHttpMethod(settings.method),
    body: normalizeBodyValue(settings.body),
    parser: normalizeHttpParser(settings.parser),
    timeoutMs: normalizeTimeout(settings.timeoutMs, config.fetchTimeoutMs),
    headers: customHeaders,
    credentialProfileId,
    credentialProfile,
  };
};

export const buildCanonicalStreamingIntent = async ({ dashboard, datasourceId }) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId, {
    allowedTypes: STREAM_DATASOURCE_TYPES,
  });
  const datasourceType = getDatasourceType(datasource);
  const settings =
    datasource.settings && typeof datasource.settings === "object"
      ? datasource.settings
      : {};

  if (datasourceType === "sse" || datasourceType === "websocket") {
    const targetUrl = String(settings.url || "").trim();
    if (!targetUrl) {
      throw createClientError(400, "Datasource URL is required", "DATASOURCE_URL_REQUIRED");
    }

    const credentialProfileId = String(settings.credentialProfileId || "").trim() || null;
    let credentialProfile = null;
    if (credentialProfileId) {
      credentialProfile = await CredentialProfile.findOne({ _id: credentialProfileId }).lean();
      if (!credentialProfile) {
        throw createClientError(
          403,
          "Credential profile not found",
          "CREDENTIAL_PROFILE_NOT_FOUND"
        );
      }
    }

    const authPlacement = normalizeAuthPlacement(settings.authPlacement);
    const queryParamName =
      authPlacement === "query" ? String(settings.queryParamName || "").trim() : null;

    return {
      protocol: datasourceType,
      datasourceType,
      datasourceId: toComparableId(datasource.id),
      dashboardId: toComparableId(dashboard._id),
      url: targetUrl,
      parser: normalizeStreamParser(settings.parser),
      headers: sanitizeCustomHeaders(
        parseJsonObjectSetting(settings.headers || settings.requestHeaders)
      ),
      idleTimeoutMs: normalizeTimeout(
        settings.idleTimeoutMs,
        datasourceType === "sse" ? 120_000 : 300_000
      ),
      protocols:
        datasourceType === "websocket"
          ? normalizeWebSocketProtocols(settings.protocols)
          : [],
      authPlacement,
      queryParamName,
      credentialProfileId,
      credentialProfile,
    };
  }

  if (datasourceType === "mqtt") {
    const brokerProfileId = String(settings.brokerProfileId || "").trim();
    if (!brokerProfileId) {
      throw createClientError(
        400,
        "MQTT datasource requires brokerProfileId",
        "BROKER_PROFILE_REQUIRED"
      );
    }

    const brokerProfile = await BrokerProfile.findOne({ _id: brokerProfileId }).lean();
    if (!brokerProfile) {
      throw createClientError(403, "Broker profile not found", "BROKER_PROFILE_NOT_FOUND");
    }
    if (String(brokerProfile.protocol || "").toLowerCase() !== "mqtt") {
      throw createClientError(400, "Broker profile protocol is invalid", "BROKER_PROTOCOL_INVALID");
    }

    const topic = String(settings.topic || "").trim();
    if (!topic) {
      throw createClientError(400, "MQTT datasource requires topic", "MQTT_TOPIC_REQUIRED");
    }

    let credentialProfile = null;
    const credentialProfileId =
      String(brokerProfile.credentialProfileId || "").trim() || null;
    if (credentialProfileId) {
      credentialProfile = await CredentialProfile.findOne({ _id: credentialProfileId }).lean();
      if (!credentialProfile) {
        throw createClientError(
          403,
          "Broker credential profile not found",
          "CREDENTIAL_PROFILE_NOT_FOUND"
        );
      }
      if (String(credentialProfile.type || "").toLowerCase() !== "basic") {
        throw createClientError(
          400,
          "MQTT broker credentials must use a basic credential profile",
          "MQTT_CREDENTIAL_TYPE_INVALID"
        );
      }
    }

    return {
      protocol: "mqtt",
      datasourceType: "mqtt",
      datasourceId: toComparableId(datasource.id),
      dashboardId: toComparableId(dashboard._id),
      brokerProfileId: toComparableId(brokerProfile._id),
      brokerProfile,
      brokerUrl: String(brokerProfile.brokerUrl || "").trim(),
      topic,
      qos: normalizeQos(settings.qos),
      parser: normalizeStreamParser(settings.parser),
      keepaliveSeconds: normalizeKeepaliveSeconds(
        settings.keepaliveSeconds,
        60
      ),
      credentialProfileId,
      credentialProfile,
    };
  }

  throw createClientError(
    400,
    "Datasource type is not supported by streaming gateway",
    "UNSUPPORTED_DATASOURCE"
  );
};

const toHashableIntent = (intent = {}) => {
  const protocol = String(intent.protocol || "http").toLowerCase();
  if (protocol === "http") {
    return {
      protocol,
      dashboardId: intent.dashboardId,
      datasourceId: intent.datasourceId,
      url: intent.url,
      method: intent.method,
      body: intent.body,
      parser: intent.parser,
      timeoutMs: intent.timeoutMs,
      headers: intent.headers,
      credentialProfileId: intent.credentialProfileId || null,
    };
  }

  if (protocol === "sse" || protocol === "websocket") {
    return {
      protocol,
      dashboardId: intent.dashboardId,
      datasourceId: intent.datasourceId,
      url: intent.url,
      parser: intent.parser,
      headers: intent.headers,
      protocols: intent.protocols || [],
      authPlacement: intent.authPlacement,
      queryParamName: intent.queryParamName || null,
      idleTimeoutMs: intent.idleTimeoutMs,
      credentialProfileId: intent.credentialProfileId || null,
    };
  }

  if (protocol === "mqtt") {
    return {
      protocol,
      dashboardId: intent.dashboardId,
      datasourceId: intent.datasourceId,
      brokerProfileId: intent.brokerProfileId,
      brokerUrl: intent.brokerUrl,
      topic: intent.topic,
      qos: intent.qos,
      parser: intent.parser,
      keepaliveSeconds: intent.keepaliveSeconds,
      credentialProfileId: intent.credentialProfileId || null,
    };
  }

  return {
    protocol,
    dashboardId: intent.dashboardId,
    datasourceId: intent.datasourceId,
  };
};

export const hashDatasourceIntent = (intent) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(toHashableIntent(intent)))
    .digest("hex");

const buildCanonicalIntentForDatasource = async ({ dashboard, datasourceId }) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId);
  const datasourceType = getDatasourceType(datasource);
  if (HTTP_DATASOURCE_TYPES.has(datasourceType)) {
    return buildCanonicalDatasourceIntent({ dashboard, datasourceId });
  }
  if (STREAM_DATASOURCE_TYPES.has(datasourceType)) {
    return buildCanonicalStreamingIntent({ dashboard, datasourceId });
  }
  throw createClientError(
    400,
    `Datasource type '${datasourceType || "unknown"}' is not supported by gateway`,
    "UNSUPPORTED_DATASOURCE"
  );
};

export const mintDatasourceSessionToken = async ({
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
  const datasourceType = getDatasourceType(datasource);
  const scope = resolveScopeFromDatasourceType(datasourceType);
  if (!scope) {
    throw createClientError(
      400,
      "Datasource type is not supported by gateway",
      "UNSUPPORTED_DATASOURCE"
    );
  }

  const canonicalIntent = await buildCanonicalIntentForDatasource({
    dashboard,
    datasourceId,
  });

  const intentHash = hashDatasourceIntent(canonicalIntent);
  const credentialProfileId =
    String(canonicalIntent.credentialProfileId || "").trim() || null;

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
    scope,
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

export const validateDatasourceSessionToken = (
  token,
  { expectedScope = null } = {}
) => {
  let claims;
  try {
    claims = jwt.verify(token, config.jwtGatewaySecret, {
      algorithms: ["HS256"],
      audience: "freeboard-gateway",
      issuer: "freeboard-api",
    });
  } catch {
    throw createClientError(
      401,
      "Invalid or expired datasource session token",
      "TOKEN_INVALID"
    );
  }

  if (expectedScope && String(claims?.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch", "TOKEN_SCOPE_MISMATCH");
  }

  return claims;
};

const ensureTokenScopeMatchesDatasource = ({ tokenClaims, datasourceType }) => {
  const expectedScope = resolveScopeFromDatasourceType(datasourceType);
  if (!expectedScope) {
    throw createClientError(
      400,
      "Datasource type is not supported by gateway",
      "UNSUPPORTED_DATASOURCE"
    );
  }
  if (String(tokenClaims?.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch", "TOKEN_SCOPE_MISMATCH");
  }
  return expectedScope;
};

const enforcePublicCredentialPolicy = ({
  tokenClaims,
  credentialProfile,
  brokerProfile,
  protocol,
}) => {
  if (String(tokenClaims?.sub || "") !== "public") {
    return;
  }

  if ((protocol === "sse" || protocol === "websocket") && credentialProfile) {
    if (credentialProfile.allowPublicUse !== true) {
      throw createClientError(
        403,
        "Credential profile does not allow public usage",
        "CREDENTIAL_PUBLIC_FORBIDDEN"
      );
    }
    return;
  }

  if (protocol === "mqtt") {
    if (!brokerProfile || brokerProfile.allowPublicUse !== true) {
      throw createClientError(
        403,
        "Broker profile does not allow public usage",
        "BROKER_PUBLIC_FORBIDDEN"
      );
    }

    if (credentialProfile && credentialProfile.allowPublicUse !== true) {
      throw createClientError(
        403,
        "Credential profile does not allow public usage",
        "CREDENTIAL_PUBLIC_FORBIDDEN"
      );
    }
  }
};

const resolveStreamingSseWebsocketIntent = ({
  canonicalIntent,
  tokenClaims,
  decryptSecret,
}) => {
  const profile = canonicalIntent.credentialProfile || null;
  const protocol = canonicalIntent.protocol;
  enforcePublicCredentialPolicy({
    tokenClaims,
    credentialProfile: profile,
    brokerProfile: null,
    protocol,
  });

  const headers = {
    ...canonicalIntent.headers,
  };
  let url = canonicalIntent.url;

  if (profile) {
    const secret = decryptSecret(profile.secret);
    if (canonicalIntent.authPlacement === "query") {
      const queryValue = resolveQueryCredentialValue({ profile, secret });
      if (queryValue) {
        url = applyQueryCredentialToUrl({
          rawUrl: url,
          paramName: canonicalIntent.queryParamName,
          value: queryValue,
        });
      }
    } else {
      Object.assign(
        headers,
        resolveCredentialHeaders({
          profile,
          secret,
        })
      );
    }
  }

  return {
    protocol,
    url,
    parser: canonicalIntent.parser,
    headers,
    idleTimeoutMs: canonicalIntent.idleTimeoutMs,
    protocols:
      protocol === "websocket"
        ? normalizeWebSocketProtocols(canonicalIntent.protocols)
        : [],
    authPlacement: canonicalIntent.authPlacement,
  };
};

const resolveMqttIntent = ({
  canonicalIntent,
  tokenClaims,
  decryptSecret,
}) => {
  const brokerProfile = canonicalIntent.brokerProfile || null;
  const credentialProfile = canonicalIntent.credentialProfile || null;

  enforcePublicCredentialPolicy({
    tokenClaims,
    credentialProfile,
    brokerProfile,
    protocol: "mqtt",
  });

  let username = null;
  let password = null;
  if (credentialProfile) {
    if (String(credentialProfile.type || "").toLowerCase() !== "basic") {
      throw createClientError(
        400,
        "MQTT broker credentials must use a basic credential profile",
        "MQTT_CREDENTIAL_TYPE_INVALID"
      );
    }
    const secret = decryptSecret(credentialProfile.secret);
    username = String(secret?.username || "");
    password = String(secret?.password || "");
    if (!username || !password) {
      throw createClientError(403, "Credential profile is incomplete", "CREDENTIAL_INVALID");
    }
  }

  return {
    protocol: "mqtt",
    brokerProfileId: canonicalIntent.brokerProfileId,
    brokerUrl: canonicalIntent.brokerUrl,
    topic: canonicalIntent.topic,
    qos: canonicalIntent.qos,
    parser: canonicalIntent.parser,
    keepaliveSeconds: canonicalIntent.keepaliveSeconds,
    tls: canonicalIntent.brokerProfile?.tls || {},
    topicAllowlist: Array.isArray(canonicalIntent.brokerProfile?.topicAllowlist)
      ? canonicalIntent.brokerProfile.topicAllowlist
      : [],
    username: username || null,
    password: password || null,
  };
};

export const resolveGatewayIntrospection = async ({
  dashboard,
  datasourceId,
  tokenClaims,
  decryptSecret,
}) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId);
  const datasourceType = getDatasourceType(datasource);
  const scope = ensureTokenScopeMatchesDatasource({
    tokenClaims,
    datasourceType,
  });

  const canonicalIntent = await buildCanonicalIntentForDatasource({
    dashboard,
    datasourceId,
  });
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

  if (scope === "datasource:fetch") {
    let credentialHeaders = {};
    if (canonicalIntent.credentialProfile) {
      const profile = canonicalIntent.credentialProfile;
      enforcePublicCredentialPolicy({
        tokenClaims,
        credentialProfile: profile,
        brokerProfile: null,
        protocol: "http",
      });
      const secret = decryptSecret(profile.secret);
      credentialHeaders = resolveCredentialHeaders({
        profile,
        secret,
      });
    }

    return {
      dashboardId: canonicalIntent.dashboardId,
      datasourceId: canonicalIntent.datasourceId,
      credentialProfileId: canonicalIntent.credentialProfile?._id || null,
      scope,
      intent: {
        protocol: "http",
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
  }

  if (scope === "datasource:stream") {
    let streamIntent;
    if (canonicalIntent.protocol === "mqtt") {
      streamIntent = resolveMqttIntent({
        canonicalIntent,
        tokenClaims,
        decryptSecret,
      });
    } else {
      streamIntent = resolveStreamingSseWebsocketIntent({
        canonicalIntent,
        tokenClaims,
        decryptSecret,
      });
    }

    return {
      dashboardId: canonicalIntent.dashboardId,
      datasourceId: canonicalIntent.datasourceId,
      credentialProfileId: canonicalIntent.credentialProfile?._id || null,
      scope,
      intent: streamIntent,
    };
  }

  throw createClientError(403, "Datasource token scope mismatch", "TOKEN_SCOPE_MISMATCH");
};
