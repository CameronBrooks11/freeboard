/**
 * @module datasourceGateway
 * Canonical datasource intent + session token helpers for API/gateway trust flow.
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { dataStore } from "./data/index.js";
import {
  applyQueryCredentialToUrl,
  normalizeAuthPlacement,
  normalizeBodyValue,
  normalizeHttpMethod,
  normalizeHttpParser,
  normalizeKeepaliveSeconds,
  normalizeQos,
  normalizeStreamParser,
  normalizeTimeout,
  normalizeWebSocketProtocols,
  parseJsonObjectSetting,
  resolveCredentialHeaders,
  resolveQueryCredentialValue,
  sanitizeCustomHeaders,
} from "./datasourceGatewayIntentUtils.js";

const EXTERNAL_VISIBILITIES = new Set(["link", "public"]);
const HTTP_DATASOURCE_TYPES = new Set(["http"]);
const STREAM_DATASOURCE_TYPES = new Set(["sse", "websocket", "mqtt"]);
const SUPPORTED_GATEWAY_DATASOURCE_TYPES = new Set([
  ...HTTP_DATASOURCE_TYPES,
  ...STREAM_DATASOURCE_TYPES,
]);
const credentialProfileRepository = dataStore.repositories.credentialProfiles;
const brokerProfileRepository = dataStore.repositories.brokerProfiles;

type UnknownRecord = Record<string, unknown>;
type DashboardLike = {
  _id?: unknown;
  user?: unknown;
  visibility?: string | null;
  shareToken?: string | null;
  shareTokenVersion?: number | null;
  acl?: Array<{ userId?: unknown }>;
  document?: {
    datasources?: Array<{
      id?: unknown;
      type?: string | null;
      settings?: Record<string, unknown> | null;
    }> | null;
  } | null;
};

type PrincipalLike = {
  _id?: unknown;
  role?: string;
};

export type DatasourceSessionTokenClaims = jwt.JwtPayload & {
  sub?: string;
  scope?: string;
  dashboardId?: string;
  datasourceId?: string;
  credentialProfileId?: string | null;
  intentHash?: string;
  shareTokenVersion?: number | null;
};

export const DATASOURCE_SESSION_TTL_SECONDS = Math.max(
  60,
  Math.floor(Number(config.datasourceSessionTtlSeconds) || 300),
);

const toComparableId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value?.toString === "function") {
    return value.toString();
  }
  return String(value);
};

export const createClientError = (
  statusCode: number,
  message: string,
  code: string | null = null,
) => {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
};

const resolveAclAccess = (dashboard: DashboardLike, userId: unknown) => {
  const normalizedUserId = toComparableId(userId);
  const entries = Array.isArray(dashboard?.acl) ? dashboard.acl : [];
  return entries.find((entry) => toComparableId(entry?.userId) === normalizedUserId) || null;
};

const canUserReadDashboard = ({
  dashboard,
  user,
}: {
  dashboard: DashboardLike;
  user: PrincipalLike | null;
}) => {
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

const ensureExternalVisibility = (dashboard: DashboardLike): string => {
  const visibility = String(dashboard?.visibility || "private").toLowerCase();
  if (!EXTERNAL_VISIBILITIES.has(visibility)) {
    throw createClientError(403, "Dashboard is not externally visible", "DASHBOARD_PRIVATE");
  }
  return visibility;
};

const ensurePublicDashboardAllowed = ({
  dashboard,
  shareToken,
}: {
  dashboard: DashboardLike;
  shareToken: string | null;
}): void => {
  const visibility = ensureExternalVisibility(dashboard);

  if (visibility === "link") {
    const normalizedShareToken = String(shareToken || "").trim();
    if (!normalizedShareToken || normalizedShareToken !== dashboard.shareToken) {
      throw createClientError(403, "Dashboard share token is invalid", "SHARE_TOKEN_INVALID");
    }
  }
};

const getDatasourceType = (datasource: { type?: string | null } | null | undefined) =>
  String(datasource?.type || "")
    .trim()
    .toLowerCase();

const resolveScopeFromDatasourceType = (datasourceType: string) =>
  HTTP_DATASOURCE_TYPES.has(datasourceType)
    ? "datasource:fetch"
    : STREAM_DATASOURCE_TYPES.has(datasourceType)
      ? "datasource:stream"
      : null;

export const findDashboardDatasource = (
  dashboard: DashboardLike,
  datasourceId: unknown,
  { allowedTypes = SUPPORTED_GATEWAY_DATASOURCE_TYPES } = {},
) => {
  const targetDatasourceId = toComparableId(datasourceId);
  const datasources = Array.isArray(dashboard?.document?.datasources)
    ? dashboard.document.datasources
    : [];
  const datasource =
    datasources.find((entry) => toComparableId(entry?.id) === targetDatasourceId) || null;

  if (!datasource) {
    throw createClientError(404, "Datasource not found", "DATASOURCE_NOT_FOUND");
  }

  const datasourceType = getDatasourceType(datasource);
  if (!allowedTypes.has(datasourceType)) {
    throw createClientError(
      400,
      "Datasource type is not supported by gateway",
      "UNSUPPORTED_DATASOURCE",
    );
  }

  return datasource;
};

export const buildCanonicalDatasourceIntent = async ({
  dashboard,
  datasourceId,
}: {
  dashboard: DashboardLike;
  datasourceId: unknown;
}) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId, {
    allowedTypes: HTTP_DATASOURCE_TYPES,
  });
  const settings =
    datasource.settings && typeof datasource.settings === "object" ? datasource.settings : {};

  const targetUrl = String(settings.url || "").trim();
  if (!targetUrl) {
    throw createClientError(400, "Datasource URL is required", "DATASOURCE_URL_REQUIRED");
  }

  const credentialProfileId = String(settings.credentialProfileId || "").trim() || null;
  let credentialProfile = null;
  if (credentialProfileId) {
    credentialProfile = await credentialProfileRepository.findById({
      profileId: credentialProfileId,
    });
    if (!credentialProfile) {
      throw createClientError(403, "Credential profile not found", "CREDENTIAL_PROFILE_NOT_FOUND");
    }
  }

  const customHeaders = sanitizeCustomHeaders(
    parseJsonObjectSetting(settings.headers || settings.requestHeaders),
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

export const buildCanonicalStreamingIntent = async ({
  dashboard,
  datasourceId,
}: {
  dashboard: DashboardLike;
  datasourceId: unknown;
}) => {
  const datasource = findDashboardDatasource(dashboard, datasourceId, {
    allowedTypes: STREAM_DATASOURCE_TYPES,
  });
  const datasourceType = getDatasourceType(datasource);
  const settings =
    datasource.settings && typeof datasource.settings === "object" ? datasource.settings : {};

  if (datasourceType === "sse" || datasourceType === "websocket") {
    const targetUrl = String(settings.url || "").trim();
    if (!targetUrl) {
      throw createClientError(400, "Datasource URL is required", "DATASOURCE_URL_REQUIRED");
    }

    const credentialProfileId = String(settings.credentialProfileId || "").trim() || null;
    let credentialProfile = null;
    if (credentialProfileId) {
      credentialProfile = await credentialProfileRepository.findById({
        profileId: credentialProfileId,
      });
      if (!credentialProfile) {
        throw createClientError(
          403,
          "Credential profile not found",
          "CREDENTIAL_PROFILE_NOT_FOUND",
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
        parseJsonObjectSetting(settings.headers || settings.requestHeaders),
      ),
      idleTimeoutMs: normalizeTimeout(
        settings.idleTimeoutMs,
        datasourceType === "sse" ? 120_000 : 300_000,
      ),
      protocols:
        datasourceType === "websocket" ? normalizeWebSocketProtocols(settings.protocols) : [],
      authPlacement,
      queryParamName,
      credentialProfileId,
      credentialProfile,
    } as CanonicalSseWebsocketIntent;
  }

  if (datasourceType === "mqtt") {
    const brokerProfileId = String(settings.brokerProfileId || "").trim();
    if (!brokerProfileId) {
      throw createClientError(
        400,
        "MQTT datasource requires brokerProfileId",
        "BROKER_PROFILE_REQUIRED",
      );
    }

    const brokerProfile = await brokerProfileRepository.findById({
      profileId: brokerProfileId,
    });
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
    const credentialProfileId = String(brokerProfile.credentialProfileId || "").trim() || null;
    if (credentialProfileId) {
      credentialProfile = await credentialProfileRepository.findById({
        profileId: credentialProfileId,
      });
      if (!credentialProfile) {
        throw createClientError(
          403,
          "Broker credential profile not found",
          "CREDENTIAL_PROFILE_NOT_FOUND",
        );
      }
      if (String(credentialProfile.type || "").toLowerCase() !== "basic") {
        throw createClientError(
          400,
          "MQTT broker credentials must use a basic credential profile",
          "MQTT_CREDENTIAL_TYPE_INVALID",
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
      keepaliveSeconds: normalizeKeepaliveSeconds(settings.keepaliveSeconds, 60),
      credentialProfileId,
      credentialProfile,
    } as CanonicalMqttIntent;
  }

  throw createClientError(
    400,
    "Datasource type is not supported by streaming gateway",
    "UNSUPPORTED_DATASOURCE",
  );
};

const toHashableIntent = (intent: Record<string, unknown> = {}) => {
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

export const hashDatasourceIntent = (intent: Record<string, unknown>) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(toHashableIntent(intent)))
    .digest("hex");

const buildCanonicalIntentForDatasource = async ({
  dashboard,
  datasourceId,
}: {
  dashboard: DashboardLike;
  datasourceId: unknown;
}) => {
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
    "UNSUPPORTED_DATASOURCE",
  );
};

type CanonicalHttpIntent = Awaited<ReturnType<typeof buildCanonicalDatasourceIntent>>;
type CanonicalSseWebsocketIntent = {
  protocol: "sse" | "websocket";
  datasourceType: string;
  datasourceId: string | null;
  dashboardId: string | null;
  url: string;
  parser: string;
  headers: Record<string, string>;
  idleTimeoutMs: number;
  protocols: string[];
  authPlacement: string;
  queryParamName: string | null;
  credentialProfileId: string | null;
  credentialProfile: UnknownRecord | null;
};
type CanonicalMqttIntent = {
  protocol: "mqtt";
  datasourceType: "mqtt";
  datasourceId: string | null;
  dashboardId: string | null;
  brokerProfileId: string | null;
  brokerProfile: UnknownRecord;
  brokerUrl: string;
  topic: string;
  qos: number;
  parser: string;
  keepaliveSeconds: number;
  credentialProfileId: string | null;
  credentialProfile: UnknownRecord | null;
};

export const mintDatasourceSessionToken = async ({
  dashboard,
  datasourceId,
  user = null,
  shareToken = null,
}: {
  dashboard: DashboardLike;
  datasourceId: unknown;
  user?: PrincipalLike | null;
  shareToken?: string | null;
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
      "UNSUPPORTED_DATASOURCE",
    );
  }

  const canonicalIntent = await buildCanonicalIntentForDatasource({
    dashboard,
    datasourceId,
  });

  const intentHash = hashDatasourceIntent(canonicalIntent);
  const credentialProfileId = String(canonicalIntent.credentialProfileId || "").trim() || null;

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
  token: string,
  { expectedScope = null }: { expectedScope?: string | null } = {},
): DatasourceSessionTokenClaims => {
  let claims;
  try {
    claims = jwt.verify(token, config.jwtGatewaySecret, {
      algorithms: ["HS256"],
      audience: "freeboard-gateway",
      issuer: "freeboard-api",
    });
  } catch {
    throw createClientError(401, "Invalid or expired datasource session token", "TOKEN_INVALID");
  }

  const resolvedClaims = claims as DatasourceSessionTokenClaims;

  if (expectedScope && String(resolvedClaims.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch", "TOKEN_SCOPE_MISMATCH");
  }

  return resolvedClaims;
};

const ensureTokenScopeMatchesDatasource = ({
  tokenClaims,
  datasourceType,
}: {
  tokenClaims: DatasourceSessionTokenClaims;
  datasourceType: string;
}) => {
  const expectedScope = resolveScopeFromDatasourceType(datasourceType);
  if (!expectedScope) {
    throw createClientError(
      400,
      "Datasource type is not supported by gateway",
      "UNSUPPORTED_DATASOURCE",
    );
  }
  if (String(tokenClaims?.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch", "TOKEN_SCOPE_MISMATCH");
  }
  return expectedScope;
};

export const enforcePublicCredentialPolicy = ({
  tokenClaims,
  credentialProfile,
  brokerProfile,
  protocol,
}: {
  tokenClaims: DatasourceSessionTokenClaims;
  credentialProfile: UnknownRecord | null;
  brokerProfile: UnknownRecord | null;
  protocol: string;
}) => {
  if (String(tokenClaims?.sub || "") !== "public") {
    return;
  }

  // HTTP shares the streaming credential rule: a public flow may only inject an
  // `allowPublicUse` credential (the authenticated flow is gated at authoring time).
  if (
    (protocol === "http" || protocol === "sse" || protocol === "websocket") &&
    credentialProfile
  ) {
    if (credentialProfile.allowPublicUse !== true) {
      throw createClientError(
        403,
        "Credential profile does not allow public usage",
        "CREDENTIAL_PUBLIC_FORBIDDEN",
      );
    }
    return;
  }

  if (protocol === "mqtt") {
    if (!brokerProfile || brokerProfile.allowPublicUse !== true) {
      throw createClientError(
        403,
        "Broker profile does not allow public usage",
        "BROKER_PUBLIC_FORBIDDEN",
      );
    }

    if (credentialProfile && credentialProfile.allowPublicUse !== true) {
      throw createClientError(
        403,
        "Credential profile does not allow public usage",
        "CREDENTIAL_PUBLIC_FORBIDDEN",
      );
    }
  }
};

const resolveStreamingSseWebsocketIntent = ({
  canonicalIntent,
  tokenClaims,
  decryptSecret,
}: {
  canonicalIntent: CanonicalSseWebsocketIntent;
  tokenClaims: DatasourceSessionTokenClaims;
  decryptSecret: (value: unknown) => Record<string, unknown>;
}) => {
  const profile = canonicalIntent.credentialProfile || null;
  const protocol: "sse" | "websocket" = canonicalIntent.protocol;
  enforcePublicCredentialPolicy({
    tokenClaims,
    credentialProfile: profile,
    brokerProfile: null,
    protocol,
  });

  const headers: Record<string, string> = {
    ...canonicalIntent.headers,
  };
  let url = canonicalIntent.url;

  if (profile) {
    const secret = decryptSecret(profile.secret);
    if (canonicalIntent.authPlacement === "query") {
      const queryValue = resolveQueryCredentialValue({ profile, secret, createClientError });
      if (queryValue) {
        url = applyQueryCredentialToUrl({
          rawUrl: url,
          paramName: canonicalIntent.queryParamName || "",
          value: queryValue,
          createClientError,
        });
      }
    } else {
      Object.assign(
        headers,
        resolveCredentialHeaders({
          profile,
          secret,
          createClientError,
        }),
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
      protocol === "websocket" ? normalizeWebSocketProtocols(canonicalIntent.protocols) : [],
    authPlacement: canonicalIntent.authPlacement,
  };
};

const resolveMqttIntent = ({
  canonicalIntent,
  tokenClaims,
  decryptSecret,
}: {
  canonicalIntent: CanonicalMqttIntent;
  tokenClaims: DatasourceSessionTokenClaims;
  decryptSecret: (value: unknown) => Record<string, unknown>;
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
        "MQTT_CREDENTIAL_TYPE_INVALID",
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
    tls:
      canonicalIntent.brokerProfile && typeof canonicalIntent.brokerProfile.tls === "object"
        ? canonicalIntent.brokerProfile.tls
        : {},
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
}: {
  dashboard: DashboardLike;
  datasourceId: unknown;
  tokenClaims: DatasourceSessionTokenClaims;
  decryptSecret: (value: unknown) => Record<string, unknown>;
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
    const user = await dataStore.repositories.users.findActiveById({
      userId: String(tokenClaims.sub || "").trim(),
    });
    if (!user || !canUserReadDashboard({ dashboard, user })) {
      throw createClientError(403, "Dashboard access denied", "FORBIDDEN");
    }
  }

  if (scope === "datasource:fetch") {
    if (canonicalIntent.protocol !== "http") {
      throw createClientError(403, "Datasource token scope mismatch", "TOKEN_SCOPE_MISMATCH");
    }
    const httpIntent = canonicalIntent as CanonicalHttpIntent;

    let credentialHeaders = {};
    if (httpIntent.credentialProfile) {
      const profile = httpIntent.credentialProfile;
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
        createClientError,
      });
    }

    return {
      dashboardId: canonicalIntent.dashboardId,
      datasourceId: httpIntent.datasourceId,
      credentialProfileId: httpIntent.credentialProfile?._id || null,
      scope,
      intent: {
        protocol: "http",
        url: httpIntent.url,
        method: httpIntent.method,
        body: httpIntent.body,
        parser: httpIntent.parser,
        timeoutMs: httpIntent.timeoutMs,
        headers: {
          ...httpIntent.headers,
          ...credentialHeaders,
        },
      },
    };
  }

  if (scope === "datasource:stream") {
    let streamIntent;
    if (canonicalIntent.protocol === "mqtt") {
      streamIntent = resolveMqttIntent({
        canonicalIntent: canonicalIntent as CanonicalMqttIntent,
        tokenClaims,
        decryptSecret,
      });
    } else {
      streamIntent = resolveStreamingSseWebsocketIntent({
        canonicalIntent: canonicalIntent as CanonicalSseWebsocketIntent,
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
