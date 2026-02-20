/**
 * @module gateway/index
 * Datasource gateway service with secure HTTP fetch and realtime protocol adapters.
 */

import "dotenv/config";
import crypto from "node:crypto";
import * as http from "http";
import * as https from "https";
import dns from "dns";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";
import WebSocket, { WebSocketServer } from "ws";
import {
  isMqttTopicAllowed,
  matchesMqttTopicPattern,
  normalizeMqttAllowlist,
} from "./realtime/mqttCodec.js";
import { createProtocolAdapterFactory } from "./realtime/protocolAdapters.js";
import { SimpleMqttClient } from "./realtime/SimpleMqttClient.js";
import { createClientError } from "./errors.js";
import { deriveClientIp as deriveTrustedClientIp, type DeriveClientIpOptions } from "./clientIp.js";
import {
  ensureResolvedDestinationIsAllowed,
  parseOutboundUrl,
  parseTargetUrl,
  type ResolvedDestination,
} from "./networkPolicy.js";
import {
  createGatewayFetchHandler,
  createUpstreamRequestOptions,
  normalizeRequestHeaders,
  parseStreamPayload,
} from "./gatewayHttp.js";
import {
  consumeGatewayLimiter,
  fetchIntrospection,
  fetchRevokedTokens,
  validateSessionToken,
  type DatasourceIntrospectionResponse,
  type RevokedTokensFeedResponse,
} from "./gatewayApiClient.js";
import {
  ALLOW_INSECURE_TLS,
  GATEWAY_SERVICE_TOKEN,
  HOST,
  IS_PRODUCTION,
  PORT,
  REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN,
  REALTIME_CONNECT_TIMEOUT_MS,
  REALTIME_ENABLED,
  getRealtimeLimiterFailureMode,
  REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP,
  REALTIME_MAX_CONNECTIONS_PER_DASHBOARD,
  REALTIME_MAX_MESSAGE_BYTES,
  REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION,
  REALTIME_MQTT_ALLOWED_TOPICS,
  REALTIME_MQTT_ENABLED,
  REALTIME_MQTT_IDLE_DISCONNECT_MS,
  REALTIME_MQTT_KEEPALIVE_SECONDS,
  REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER,
  REALTIME_MQTT_MAX_MESSAGE_BYTES,
  REALTIME_MQTT_MAX_QOS,
  REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS,
  REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS,
  REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN,
  REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN,
  REALTIME_RECONNECT_MAX_MS,
  REALTIME_RECONNECT_MIN_MS,
  REALTIME_SSE_ENABLED,
  REALTIME_SSE_IDLE_TIMEOUT_MS,
  REALTIME_TRUST_PROXY_HOPS,
  REALTIME_WS_ENABLED,
  REALTIME_WS_IDLE_TIMEOUT_MS,
  REALTIME_WS_PING_INTERVAL_MS,
  REVOKED_TOKENS_MAX_BATCH,
  STREAM_ERROR_CODES,
} from "./runtimeConfig.js";
import {
  getGatewayRuntimeMetricsSnapshot,
  recordGatewayHttpRequest,
  recordRealtimeConnectionAccepted,
  recordRealtimeConnectionAttempt,
  recordRealtimeConnectionClosed,
  recordRealtimeConnectionRejected,
  recordRealtimeError,
  recordRealtimeLimiterDecision,
  recordRealtimeMessageIn,
  recordRealtimeMessageOut,
} from "./runtimeMetrics.js";

dns.setDefaultResultOrder?.("ipv4first");
export { matchesMqttTopicPattern, parseTargetUrl, ensureResolvedDestinationIsAllowed };
export { createGatewayFetchHandler };

type RealtimeGatewayOptions = {
  server: http.Server;
  trustProxyHops?: number;
  lookup?: typeof dns.promises.lookup;
  fetchFn?: typeof fetch;
  wsServerFactory?: (options: ConstructorParameters<typeof WebSocketServer>[0]) => WebSocketServer;
  wsClientFactory?: (
    url: string,
    protocols?: string | string[],
    options?: ConstructorParameters<typeof WebSocket>[2],
  ) => WebSocket;
};

type TokenClaims = Record<string, unknown>;
type RealtimeEnvelope = Record<string, unknown>;
type RealtimeIntent = {
  protocol?: string;
  url?: string;
  parser?: string;
  headers?: Record<string, unknown>;
  protocols?: string[];
  body?: unknown;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  brokerUrl?: string;
  brokerProfileId?: string;
  username?: string;
  password?: string;
  keepaliveSeconds?: number;
  qos?: number;
  topic?: string;
  topicAllowlist?: string[];
  tls?: Record<string, unknown>;
};
type RealtimeAdapter = {
  stop: () => void | Promise<void>;
};
type RealtimeSubscription = {
  dashboardId: string;
  datasourceId: string;
  sessionToken: string;
  tokenClaims: TokenClaims;
  introspection: DatasourceIntrospectionResponse;
  adapter: RealtimeAdapter;
  tokenExpiryTimer: ReturnType<typeof setTimeout> | null;
};
type RealtimeConnection = {
  id: string;
  ws: WebSocket & { __clientIp?: string };
  ip: string;
  subscriptions: Map<string, RealtimeSubscription>;
  pendingSubscriptions: Set<string>;
};
type PublicSubscription = {
  connectionId: string;
  dashboardId: string;
  datasourceId: string;
  shareTokenVersion: number;
  sessionToken: string;
};
type MqttPoolEntry = {
  key: string;
  brokerProfileId: string;
  client: SimpleMqttClient;
  refCount: number;
  topicRefCounts: Map<string, number>;
  idleTimer: ReturnType<typeof setTimeout> | null;
};
type RealtimeClientMessage = {
  type?: string;
  requestId?: string;
  dashboardId?: string;
  datasourceId?: string;
  sessionToken?: string;
};
type AckPayload = {
  requestId: string | null;
  datasourceId?: string | null;
  ok: boolean;
  errorCode?: string | null;
  message?: string | null;
};

const websocketRawDataToBuffer = (rawPayload: WebSocket.RawData): Buffer => {
  if (Buffer.isBuffer(rawPayload)) {
    return rawPayload;
  }
  if (Array.isArray(rawPayload)) {
    return Buffer.concat(
      rawPayload.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(entry))),
    );
  }
  if (rawPayload instanceof ArrayBuffer) {
    return Buffer.from(rawPayload);
  }
  return Buffer.from(String(rawPayload));
};

const hashLimiterKeyPart = (value: unknown): string =>
  crypto
    .createHash("sha256")
    .update(
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .digest("hex")
    .slice(0, 32);

export const getTokenExpiryDelayMs = (
  tokenClaims: TokenClaims | null | undefined,
  nowMs = Date.now(),
): number | null => {
  const expSeconds = Number(tokenClaims?.exp);
  if (!Number.isFinite(expSeconds)) {
    return null;
  }
  return Math.floor(expSeconds * 1000 - nowMs);
};

export const deriveClientIp = (
  request: http.IncomingMessage,
  { trustProxyHops = REALTIME_TRUST_PROXY_HOPS, ...options }: DeriveClientIpOptions = {},
): string =>
  deriveTrustedClientIp(request, {
    trustProxyHops,
    warningPrefix: "Realtime gateway warning: ",
    ...options,
  });

const mapStreamErrorCode = (
  error: unknown,
  fallback = STREAM_ERROR_CODES.CONNECT_FAILED,
): string => {
  const errorLike =
    error && typeof error === "object"
      ? (error as { streamErrorCode?: string; statusCode?: number })
      : null;
  if (errorLike?.streamErrorCode) {
    return errorLike.streamErrorCode;
  }

  const statusCode = Number(errorLike?.statusCode) || 0;
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

const sanitizeErrorMessage = (error: unknown, fallback: string): string => {
  const errorLike =
    error && typeof error === "object"
      ? (error as { statusCode?: number; message?: string })
      : null;
  const statusCode = Number(errorLike?.statusCode) || 500;
  if (statusCode >= 500) {
    return fallback;
  }
  return String(errorLike?.message || fallback);
};

const parseRealtimeTargetUrl = ({
  rawTarget,
  protocol,
}: {
  rawTarget: string;
  protocol: string;
}) => {
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
    STREAM_ERROR_CODES.POLICY_BLOCKED,
  );
};

/**
 * Attach realtime gateway websocket endpoint to an HTTP server.
 */
export const createRealtimeGateway = ({
  server,
  trustProxyHops,
  lookup = dns.promises.lookup,
  fetchFn = fetch,
  wsServerFactory = (options) => new WebSocketServer(options),
  wsClientFactory = (url, protocols, options) => new WebSocket(url, protocols, options),
}: RealtimeGatewayOptions) => {
  const wss = wsServerFactory({
    noServer: true,
    maxPayload: REALTIME_MAX_MESSAGE_BYTES,
  });

  const connectionsById = new Map<string, RealtimeConnection>();
  const connectionCountByIp = new Map<string, number>();
  const dashboardConnectionRefs = new Map<string, Set<string>>();
  const publicSubscriptions = new Map<string, PublicSubscription>();
  const mqttPool = new Map<string, MqttPoolEntry>();

  let revocationCursor: string | null = null;
  let pollingRevocations = false;

  const consumeRealtimeRateLimit = async ({
    scope,
    key,
    limitPerMinute,
  }: {
    scope: string;
    key: string;
    limitPerMinute: number;
  }): Promise<{ allowed: boolean; retryAfterMs: number; unavailable: boolean }> => {
    try {
      const decision = await consumeGatewayLimiter({
        scope,
        key: hashLimiterKeyPart(key),
        limitPerMinute,
        fetchFn,
      });
      const allowed = Boolean(decision?.allowed);
      const reason = String(decision?.reason || "")
        .trim()
        .toLowerCase();
      const retryAfterMs = Math.max(0, Number(decision?.retryAfterMs) || 0);

      if (allowed) {
        if (reason === "backend_fail_open") {
          recordRealtimeLimiterDecision({ outcome: "backend_error" });
          recordRealtimeLimiterDecision({ outcome: "fail_open" });
          return { allowed: true, retryAfterMs: 0, unavailable: false };
        }
        recordRealtimeLimiterDecision({ outcome: "allowed" });
        return { allowed: true, retryAfterMs: 0, unavailable: false };
      }

      if (reason === "backend_fail_closed") {
        recordRealtimeLimiterDecision({ outcome: "backend_error" });
        if (getRealtimeLimiterFailureMode() === "fail-open") {
          recordRealtimeLimiterDecision({ outcome: "fail_open" });
          return { allowed: true, retryAfterMs: 0, unavailable: false };
        }

        recordRealtimeLimiterDecision({ outcome: "fail_closed" });
        return {
          allowed: false,
          retryAfterMs: 1000,
          unavailable: true,
        };
      }

      recordRealtimeLimiterDecision({ outcome: "rejected" });
      return {
        allowed: false,
        retryAfterMs: Math.max(1, retryAfterMs),
        unavailable: false,
      };
    } catch {
      recordRealtimeLimiterDecision({ outcome: "backend_error" });
      if (getRealtimeLimiterFailureMode() === "fail-open") {
        console.warn(
          "Realtime gateway warning: security limiter consume failed; allowing by fail-open policy.",
        );
        recordRealtimeLimiterDecision({ outcome: "fail_open" });
        return { allowed: true, retryAfterMs: 0, unavailable: false };
      }

      recordRealtimeLimiterDecision({ outcome: "fail_closed" });
      return {
        allowed: false,
        retryAfterMs: 1000,
        unavailable: true,
      };
    }
  };

  const sendWsResponse = (
    connection: RealtimeConnection | null,
    payload: RealtimeEnvelope,
  ): boolean => {
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
    recordRealtimeMessageOut();
    return true;
  };

  const sendAck = (
    connection: RealtimeConnection,
    { requestId, datasourceId = null, ok, errorCode = null, message = null }: AckPayload,
  ): void => {
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

  const sendStatus = (
    connection: RealtimeConnection,
    { datasourceId, status, errorCode = null, message = null }: Record<string, unknown>,
  ): void => {
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

  const sendError = (
    connection: RealtimeConnection,
    { datasourceId, errorCode, message }: Record<string, unknown>,
  ): void => {
    sendWsResponse(connection, {
      type: "error",
      datasourceId,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    });
  };

  const incrementConnectionCountByIp = (ip: string): void => {
    const next = (connectionCountByIp.get(ip) || 0) + 1;
    connectionCountByIp.set(ip, next);
  };

  const decrementConnectionCountByIp = (ip: string): void => {
    const current = connectionCountByIp.get(ip) || 0;
    if (current <= 1) {
      connectionCountByIp.delete(ip);
      return;
    }
    connectionCountByIp.set(ip, current - 1);
  };

  const ensureDashboardCapacity = ({
    connection,
    dashboardId,
    datasourceId,
  }: {
    connection: RealtimeConnection;
    dashboardId: string;
    datasourceId: string;
  }): void => {
    const alreadySubscribedToDashboard = [...connection.subscriptions.values()].some(
      (subscription) =>
        subscription.dashboardId === dashboardId && subscription.datasourceId !== datasourceId,
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
        STREAM_ERROR_CODES.RATE_LIMITED,
      );
    }
  };

  const attachDashboardRef = ({
    connection,
    dashboardId,
  }: {
    connection: RealtimeConnection;
    dashboardId: string;
  }): void => {
    const dashboardConnections = dashboardConnectionRefs.get(dashboardId) || new Set();
    dashboardConnections.add(connection.id);
    dashboardConnectionRefs.set(dashboardId, dashboardConnections);
  };

  const detachDashboardRefIfUnused = ({
    connection,
    dashboardId,
  }: {
    connection: RealtimeConnection;
    dashboardId: string;
  }): void => {
    const stillUsed = [...connection.subscriptions.values()].some(
      (subscription) => subscription.dashboardId === dashboardId,
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

  const setPublicSubscriptionState = ({
    connection,
    subscription,
  }: {
    connection: RealtimeConnection;
    subscription: RealtimeSubscription;
  }): void => {
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

  const clearPublicSubscriptionState = ({
    connectionId,
    datasourceId,
  }: {
    connectionId: string;
    datasourceId: string;
  }): void => {
    publicSubscriptions.delete(`${connectionId}:${datasourceId}`);
  };

  const buildMqttConnectionKey = (intent: RealtimeIntent): string => {
    const credentialHash = crypto
      .createHash("sha256")
      .update(`${intent.username || ""}\0${intent.password || ""}`)
      .digest("hex");
    return `${intent.brokerProfileId || "broker"}:${credentialHash}`;
  };

  const getMqttBrokerConnectionCount = (brokerProfileId: string): number =>
    [...mqttPool.values()].filter((entry) => entry.brokerProfileId === brokerProfileId).length;

  const acquireMqttPoolEntry = ({
    intent,
    resolvedDestination = null,
  }: {
    intent: RealtimeIntent;
    resolvedDestination?: ResolvedDestination | null;
  }): MqttPoolEntry => {
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
      getMqttBrokerConnectionCount(String(intent.brokerProfileId || "")) >=
      REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER
    ) {
      throw createClientError(
        429,
        "MQTT broker connection pool limit reached",
        STREAM_ERROR_CODES.RATE_LIMITED,
      );
    }

    const tlsOptions =
      intent.tls && typeof intent.tls === "object" && !Array.isArray(intent.tls) ? intent.tls : {};

    const client = new SimpleMqttClient({
      brokerUrl: String(intent.brokerUrl || ""),
      ...(intent.username
        ? {
            username: intent.username,
          }
        : {}),
      ...(intent.password
        ? {
            password: intent.password,
          }
        : {}),
      ...(resolvedDestination?.address
        ? {
            resolvedAddress: resolvedDestination.address,
          }
        : {}),
      ...(resolvedDestination?.family
        ? {
            resolvedFamily: resolvedDestination.family,
          }
        : {}),
      tlsServername: new URL(String(intent.brokerUrl || "")).hostname,
      keepaliveSeconds: Math.max(
        5,
        Math.floor(Number(intent.keepaliveSeconds) || REALTIME_MQTT_KEEPALIVE_SECONDS),
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
    const created: MqttPoolEntry = {
      key,
      brokerProfileId: String(intent.brokerProfileId || ""),
      client,
      refCount: 1,
      topicRefCounts: new Map<string, number>(),
      idleTimer: null,
    };

    mqttPool.set(key, created);
    return created;
  };

  const releaseMqttPoolEntry = (entry: MqttPoolEntry): void => {
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

  const ensureMqttTopicPolicy = ({ intent }: { intent: RealtimeIntent }): void => {
    const topic = String(intent.topic || "").trim();
    if (!topic) {
      throw createClientError(400, "MQTT topic is required", STREAM_ERROR_CODES.POLICY_BLOCKED);
    }

    const brokerAllowlist = normalizeMqttAllowlist(intent.topicAllowlist);
    if (brokerAllowlist.length > 0 && !isMqttTopicAllowed(topic, brokerAllowlist)) {
      throw createClientError(
        403,
        "MQTT topic is blocked by broker policy",
        STREAM_ERROR_CODES.POLICY_BLOCKED,
      );
    }

    if (
      REALTIME_MQTT_ALLOWED_TOPICS.length > 0 &&
      !isMqttTopicAllowed(topic, REALTIME_MQTT_ALLOWED_TOPICS)
    ) {
      throw createClientError(
        403,
        "MQTT topic is blocked by gateway policy",
        STREAM_ERROR_CODES.POLICY_BLOCKED,
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
        STREAM_ERROR_CODES.POLICY_BLOCKED,
      );
    }
  };

  const createProtocolAdapter = createProtocolAdapterFactory({
    parseRealtimeTargetUrl,
    ensureResolvedDestinationIsAllowed,
    lookup,
    REALTIME_SSE_IDLE_TIMEOUT_MS,
    REALTIME_MAX_MESSAGE_BYTES,
    STREAM_ERROR_CODES,
    parseStreamPayload,
    REALTIME_CONNECT_TIMEOUT_MS,
    createUpstreamRequestOptions,
    httpRequest: http.request,
    httpsRequest: https.request,
    wsClientFactory,
    normalizeRequestHeaders,
    REALTIME_WS_IDLE_TIMEOUT_MS,
    REALTIME_WS_PING_INTERVAL_MS,
    websocketOpenState: WebSocket.OPEN,
    ALLOW_INSECURE_TLS,
    REALTIME_MQTT_MAX_QOS,
    REALTIME_MQTT_MAX_MESSAGE_BYTES,
    createClientError,
    acquireMqttPoolEntry,
    releaseMqttPoolEntry,
    ensureMqttTopicPolicy,
    REALTIME_SSE_ENABLED,
    REALTIME_WS_ENABLED,
    REALTIME_MQTT_ENABLED,
  });

  const removeSubscription = async ({
    connection,
    datasourceId,
    errorCode = null,
    message = null,
  }: {
    connection: RealtimeConnection;
    datasourceId: string;
    errorCode?: string | null;
    message?: string | null;
  }): Promise<void> => {
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
  }: {
    connection: RealtimeConnection;
    datasourceId: string;
    subscription: RealtimeSubscription;
  }): void => {
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

  const cleanupConnection = async (connection: RealtimeConnection): Promise<void> => {
    const subscriptions = [...connection.subscriptions.keys()];
    await Promise.all(
      subscriptions.map((datasourceId) =>
        removeSubscription({
          connection,
          datasourceId,
        }),
      ),
    );

    connectionsById.delete(connection.id);
    decrementConnectionCountByIp(connection.ip);
  };

  const handlePublicSubscriptionRateLimit = async ({
    connection,
    dashboardId,
    tokenClaims,
  }: {
    connection: RealtimeConnection;
    dashboardId: string;
    tokenClaims: TokenClaims;
  }): Promise<void> => {
    const ipBucket = await consumeRealtimeRateLimit({
      scope: "realtime-public-subscribe-ip",
      key: connection.ip,
      limitPerMinute: REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN,
    });
    if (ipBucket.unavailable) {
      throw createClientError(
        503,
        "Realtime security limiter is temporarily unavailable",
        STREAM_ERROR_CODES.RATE_LIMITED,
      );
    }
    if (!ipBucket.allowed) {
      throw createClientError(
        429,
        "Too many public realtime subscribe requests",
        STREAM_ERROR_CODES.RATE_LIMITED,
      );
    }

    const shareVersion = Math.max(0, Math.floor(Number(tokenClaims.shareTokenVersion) || 0));
    const shareBucket = await consumeRealtimeRateLimit({
      scope: "realtime-public-subscribe-share",
      key: `${dashboardId}:${shareVersion}`,
      limitPerMinute: REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN,
    });
    if (shareBucket.unavailable) {
      throw createClientError(
        503,
        "Realtime security limiter is temporarily unavailable",
        STREAM_ERROR_CODES.RATE_LIMITED,
      );
    }
    if (!shareBucket.allowed) {
      throw createClientError(
        429,
        "Too many public realtime subscribe requests",
        STREAM_ERROR_CODES.RATE_LIMITED,
      );
    }
  };

  const handleSubscribe = async ({
    connection,
    message,
  }: {
    connection: RealtimeConnection;
    message: RealtimeClientMessage;
  }): Promise<void> => {
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
      }) as TokenClaims;

      if (
        String(tokenClaims.dashboardId || "") !== dashboardId ||
        String(tokenClaims.datasourceId || "") !== datasourceId
      ) {
        throw createClientError(
          403,
          "Datasource identifiers do not match token claims",
          STREAM_ERROR_CODES.AUTH_FAILED,
        );
      }

      if (String(tokenClaims.sub || "") === "public") {
        await handlePublicSubscriptionRateLimit({
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

      if (String(introspection.scope || "") !== "datasource:stream") {
        throw createClientError(
          403,
          "Datasource token scope mismatch",
          STREAM_ERROR_CODES.AUTH_FAILED,
        );
      }

      const intent = introspection.intent as RealtimeIntent | undefined;
      if (!intent || typeof intent !== "object") {
        throw createClientError(
          502,
          "Introspection payload is invalid",
          STREAM_ERROR_CODES.CONNECT_FAILED,
        );
      }

      if (existing) {
        if (existing.dashboardId !== dashboardId) {
          throw createClientError(
            403,
            "Datasource token dashboard mismatch",
            STREAM_ERROR_CODES.AUTH_FAILED,
          );
        }

        const existingIntentHash = String(existing.tokenClaims.intentHash || "").trim();
        const nextIntentHash = String(tokenClaims.intentHash || "").trim();
        if (existingIntentHash && nextIntentHash && existingIntentHash !== nextIntentHash) {
          throw createClientError(
            403,
            "Datasource token intent mismatch",
            STREAM_ERROR_CODES.AUTH_FAILED,
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

      const nextSubscription: RealtimeSubscription = {
        dashboardId,
        datasourceId,
        sessionToken,
        tokenClaims,
        introspection,
        adapter: { stop: () => {} },
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

  const handleUnsubscribe = async ({
    connection,
    message,
  }: {
    connection: RealtimeConnection;
    message: RealtimeClientMessage;
  }): Promise<void> => {
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

  const handlePing = ({
    connection,
    message,
  }: {
    connection: RealtimeConnection;
    message: RealtimeClientMessage;
  }): void => {
    sendWsResponse(connection, {
      type: "pong",
      requestId: message.requestId || null,
      timestamp: new Date().toISOString(),
    });
  };

  const fullRevalidatePublicSubscriptions = async (): Promise<void> => {
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

        if (String(introspection.scope || "") !== "datasource:stream") {
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

  const pollRevokedTokens = async (): Promise<void> => {
    if (pollingRevocations || publicSubscriptions.size === 0) {
      return;
    }

    pollingRevocations = true;
    try {
      const feed: RevokedTokensFeedResponse = await fetchRevokedTokens({
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
        const revokedVersion = Math.max(0, Math.floor(Number(event?.shareTokenVersion) || 0));

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
      const errorMessage =
        error && typeof error === "object" && "message" in error
          ? (error as { message?: string }).message
          : undefined;
      console.warn("Realtime gateway warning: revoked token polling failed", errorMessage || error);
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

  wss.on("connection", (ws: WebSocket, request: http.IncomingMessage) => {
    const socket = ws as WebSocket & { __clientIp?: string };
    const clientIp = socket.__clientIp || deriveClientIp(request);
    const connection: RealtimeConnection = {
      id: crypto.randomUUID(),
      ws: socket,
      ip: clientIp,
      subscriptions: new Map<string, RealtimeSubscription>(),
      pendingSubscriptions: new Set<string>(),
    };

    connectionsById.set(connection.id, connection);
    incrementConnectionCountByIp(clientIp);

    ws.on("message", (rawPayload: WebSocket.RawData, isBinary: boolean) => {
      recordRealtimeMessageIn();
      const payloadBuffer = websocketRawDataToBuffer(rawPayload);
      if (payloadBuffer.byteLength > REALTIME_MAX_MESSAGE_BYTES) {
        sendError(connection, {
          datasourceId: null,
          errorCode: STREAM_ERROR_CODES.MESSAGE_TOO_LARGE,
          message: "Realtime message exceeded size limit",
        });
        ws.close(1009, "message too large");
        return;
      }

      const rawText = isBinary ? payloadBuffer.toString("utf8") : String(rawPayload);

      let message: RealtimeClientMessage;
      try {
        message = JSON.parse(rawText) as RealtimeClientMessage;
      } catch {
        sendError(connection, {
          datasourceId: null,
          errorCode: STREAM_ERROR_CODES.PROTOCOL_ERROR,
          message: "Malformed realtime message",
        });
        return;
      }

      const type = String(message?.type || "")
        .trim()
        .toLowerCase();
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
      recordRealtimeConnectionClosed();
      void cleanupConnection(connection);
    });

    ws.on("error", () => {
      recordRealtimeError();
      void cleanupConnection(connection);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (requestUrl.pathname !== "/gateway/realtime") {
      socket.destroy();
      return;
    }
    recordRealtimeConnectionAttempt();

    if (!REALTIME_ENABLED) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const clientIp = deriveClientIp(
      request,
      trustProxyHops === undefined
        ? undefined
        : {
            trustProxyHops,
          },
    );

    void (async () => {
      const connectRateLimit = await consumeRealtimeRateLimit({
        scope: "realtime-connect-ip",
        key: clientIp,
        limitPerMinute: REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN,
      });
      if (connectRateLimit.unavailable) {
        recordRealtimeConnectionRejected();
        socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        socket.destroy();
        return;
      }
      if (!connectRateLimit.allowed) {
        recordRealtimeConnectionRejected();
        socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        socket.destroy();
        return;
      }

      const activeConnectionsForIp = connectionCountByIp.get(clientIp) || 0;
      if (activeConnectionsForIp >= REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP) {
        recordRealtimeConnectionRejected();
        socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as WebSocket & { __clientIp?: string }).__clientIp = clientIp;
        recordRealtimeConnectionAccepted();
        wss.emit("connection", ws, request);
      });
    })().catch(() => {
      recordRealtimeConnectionRejected();
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
    });
  });

  return {
    wss,
    close: async () => {
      clearInterval(revocationPollTimer);
      clearInterval(fullRevalidateTimer);

      await Promise.all(
        [...connectionsById.values()].map((connection) => cleanupConnection(connection)),
      );

      for (const entry of mqttPool.values()) {
        if (entry.idleTimer) {
          clearTimeout(entry.idleTimer);
        }
        entry.client.end(true);
      }
      mqttPool.clear();

      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
};

/**
 * Create and configure the gateway Express app.
 *
 * @param {Object} [options]
 * @returns {Object}
 */
type GatewayAppOptions = {
  lookup?: typeof dns.promises.lookup;
  fetchFn?: typeof fetch;
};

export const createGatewayApp = ({
  lookup = dns.promises.lookup,
  fetchFn = fetch,
}: GatewayAppOptions = {}) => {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  const handler = createGatewayFetchHandler({ lookup, fetchFn });
  app.post(
    "/gateway/http/fetch",
    (req: Request, res: Response, next: NextFunction) => {
      const startedAt = Date.now();
      res.on("finish", () => {
        recordGatewayHttpRequest({
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        });
      });
      next();
    },
    handler,
  );
  app.get("/internal/metrics", (req: Request, res: Response) => {
    const authHeader = String(req.headers.authorization || "");
    const serviceToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!serviceToken || serviceToken !== GATEWAY_SERVICE_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.status(200).json(getGatewayRuntimeMetricsSnapshot());
  });

  return app;
};

/**
 * Start gateway HTTP server.
 *
 * @param {Object} [options]
 * @returns {Object}
 */
export const startGatewayServer = ({
  port = PORT,
  host = HOST,
  lookup = dns.promises.lookup,
  fetchFn = fetch,
}: {
  port?: number;
  host?: string;
  lookup?: typeof dns.promises.lookup;
  fetchFn?: typeof fetch;
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
