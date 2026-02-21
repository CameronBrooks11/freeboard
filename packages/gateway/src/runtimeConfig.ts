/**
 * @module gateway/runtimeConfig
 * Runtime config normalization and constants.
 */

import { isNonDevRuntimeEnv, isWeakSharedSecret } from "@freeboard/shared/runtimePolicy.js";

const toBoolean = (value: unknown, fallback = false): boolean => {
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

const toPositiveInteger = (value: unknown, fallback: number): number => {
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

const toBoundedInteger = (
  value: unknown,
  fallback: number,
  {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
  }: { min?: number; max?: number } = {},
): number => {
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

const parseCsvList = (value: unknown): string[] =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const toLimiterFailureMode = (
  value: unknown,
  fallback: "fail-open" | "fail-closed",
): "fail-open" | "fail-closed" => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "fail-open" || normalized === "fail-closed") {
    return normalized;
  }
  return fallback;
};

export const PORT = Number(process.env.PORT || 8001);
export const HOST = process.env.HOST || "0.0.0.0";
export const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
export const IS_NON_DEV_RUNTIME = isNonDevRuntimeEnv(NODE_ENV);

export const ALLOW_INSECURE_TLS = toBoolean(process.env.EGRESS_ALLOW_INSECURE_TLS, false);
export const ALLOW_PRIVATE_DESTINATIONS = toBoolean(
  process.env.EGRESS_ALLOW_PRIVATE_DESTINATIONS,
  false,
);
export const REQUEST_TIMEOUT_MS = toPositiveInteger(process.env.FETCH_TIMEOUT_MS, 15000);
export const MAX_RESPONSE_BYTES = toPositiveInteger(
  process.env.FETCH_MAX_RESPONSE_BYTES,
  5 * 1024 * 1024,
);
export const INTROSPECTION_TIMEOUT_MS = toPositiveInteger(
  process.env.GATEWAY_INTROSPECTION_TIMEOUT_MS,
  5000,
);
export const REVOKED_TOKENS_TIMEOUT_MS = toPositiveInteger(
  process.env.GATEWAY_REVOKED_TOKENS_TIMEOUT_MS,
  5000,
);
export const REVOKED_TOKENS_MAX_BATCH = toPositiveInteger(
  process.env.GATEWAY_REVOKED_TOKENS_MAX_BATCH,
  500,
);
export const ALLOWED_HOST_PATTERNS = parseCsvList(process.env.EGRESS_ALLOWED_HOSTS).map((value) =>
  value.toLowerCase(),
);
export const ALLOWED_PORTS = parseCsvList(process.env.EGRESS_ALLOWED_PORTS || "80,443,1883,8883")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535);
export const JWT_GATEWAY_SECRET =
  process.env.JWT_GATEWAY_SECRET || "freeboard-gateway-dev-insecure-local-only-secret-32";
export const GATEWAY_SERVICE_TOKEN =
  process.env.GATEWAY_SERVICE_TOKEN || "freeboard-gateway-service-dev-token-local-only-32";
export const GATEWAY_API_BASE_URL = process.env.GATEWAY_API_BASE_URL || "http://127.0.0.1:4001";
export const GATEWAY_INTROSPECTION_URL = `${GATEWAY_API_BASE_URL.replace(/\/$/, "")}/internal/gateway/datasource-introspect`;
export const GATEWAY_REVOKED_TOKENS_URL = `${GATEWAY_API_BASE_URL.replace(/\/$/, "")}/internal/gateway/revoked-tokens`;
export const GATEWAY_LIMITER_CONSUME_URL = `${GATEWAY_API_BASE_URL.replace(/\/$/, "")}/internal/gateway/rate-limit/consume`;
export const GATEWAY_LIMITER_TIMEOUT_MS = toPositiveInteger(
  process.env.GATEWAY_LIMITER_TIMEOUT_MS,
  3000,
);
export const getRealtimeLimiterFailureMode = (): "fail-open" | "fail-closed" =>
  toLimiterFailureMode(
    process.env.REALTIME_LIMITER_FAILURE_MODE,
    IS_NON_DEV_RUNTIME ? "fail-closed" : "fail-open",
  );

export const REALTIME_ENABLED = toBoolean(process.env.REALTIME_ENABLED, true);
export const REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP = toPositiveInteger(
  process.env.REALTIME_MAX_CLIENT_CONNECTIONS_PER_IP,
  25,
);
export const REALTIME_MAX_CONNECTIONS_PER_DASHBOARD = toPositiveInteger(
  process.env.REALTIME_MAX_CONNECTIONS_PER_DASHBOARD,
  1000,
);
export const REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION = toPositiveInteger(
  process.env.REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION,
  50,
);
export const REALTIME_CONNECT_TIMEOUT_MS = toPositiveInteger(
  process.env.REALTIME_CONNECT_TIMEOUT_MS,
  10000,
);
export const REALTIME_RECONNECT_MIN_MS = toPositiveInteger(
  process.env.REALTIME_RECONNECT_MIN_MS,
  1000,
);
export const REALTIME_RECONNECT_MAX_MS = toPositiveInteger(
  process.env.REALTIME_RECONNECT_MAX_MS,
  30000,
);
export const REALTIME_MAX_MESSAGE_BYTES = toPositiveInteger(
  process.env.REALTIME_MAX_MESSAGE_BYTES,
  1024 * 1024,
);
export const REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN = toPositiveInteger(
  process.env.REALTIME_CONNECT_RATE_LIMIT_IP_PER_MIN,
  60,
);
export const REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN = toPositiveInteger(
  process.env.REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_IP_PER_MIN,
  60,
);
export const REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN = toPositiveInteger(
  process.env.REALTIME_PUBLIC_SUBSCRIBE_RATE_LIMIT_SHARE_TOKEN_PER_MIN,
  120,
);
export const REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS = toPositiveInteger(
  process.env.REALTIME_PUBLIC_REVALIDATE_INTERVAL_MS,
  30000,
);
export const REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS = toPositiveInteger(
  process.env.REALTIME_PUBLIC_FULL_REVALIDATE_INTERVAL_MS,
  300000,
);
export const REALTIME_TRUST_PROXY_HOPS = Math.max(
  0,
  toBoundedInteger(process.env.REALTIME_TRUST_PROXY_HOPS, 0, { min: 0, max: 16 }),
);

export const REALTIME_SSE_ENABLED = toBoolean(process.env.REALTIME_SSE_ENABLED, true);
export const REALTIME_SSE_IDLE_TIMEOUT_MS = toPositiveInteger(
  process.env.REALTIME_SSE_IDLE_TIMEOUT_MS,
  120000,
);

export const REALTIME_WS_ENABLED = toBoolean(process.env.REALTIME_WS_ENABLED, true);
export const REALTIME_WS_IDLE_TIMEOUT_MS = toPositiveInteger(
  process.env.REALTIME_WS_IDLE_TIMEOUT_MS,
  300000,
);
export const REALTIME_WS_PING_INTERVAL_MS = toPositiveInteger(
  process.env.REALTIME_WS_PING_INTERVAL_MS,
  30000,
);

export const REALTIME_MQTT_ENABLED = toBoolean(process.env.REALTIME_MQTT_ENABLED, true);
export const REALTIME_MQTT_MAX_MESSAGE_BYTES = toPositiveInteger(
  process.env.REALTIME_MQTT_MAX_MESSAGE_BYTES,
  256 * 1024,
);
export const REALTIME_MQTT_KEEPALIVE_SECONDS = toPositiveInteger(
  process.env.REALTIME_MQTT_KEEPALIVE_SECONDS,
  60,
);
export const REALTIME_MQTT_ALLOWED_TOPICS = parseCsvList(process.env.REALTIME_MQTT_ALLOWED_TOPICS);
export const REALTIME_MQTT_MAX_QOS = Math.max(
  0,
  Math.min(1, toBoundedInteger(process.env.REALTIME_MQTT_MAX_QOS, 1, { min: 0, max: 1 })),
);
export const REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER = toPositiveInteger(
  process.env.REALTIME_MQTT_MAX_CONNECTIONS_PER_BROKER,
  10,
);
export const REALTIME_MQTT_IDLE_DISCONNECT_MS = toPositiveInteger(
  process.env.REALTIME_MQTT_IDLE_DISCONNECT_MS,
  300000,
);

export const STREAM_ERROR_CODES = Object.freeze({
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

if (IS_NON_DEV_RUNTIME && ALLOW_INSECURE_TLS) {
  throw new Error("EGRESS_ALLOW_INSECURE_TLS=true is not allowed in non-development runtime.");
}

if (IS_NON_DEV_RUNTIME && ALLOWED_HOST_PATTERNS.length === 0) {
  throw new Error(
    "EGRESS_ALLOWED_HOSTS must be configured in non-development runtime (comma-separated host allowlist).",
  );
}

if (IS_NON_DEV_RUNTIME && isWeakSharedSecret(JWT_GATEWAY_SECRET)) {
  throw new Error("JWT_GATEWAY_SECRET is missing or too weak for non-development runtime.");
}

if (IS_NON_DEV_RUNTIME && isWeakSharedSecret(GATEWAY_SERVICE_TOKEN)) {
  throw new Error("GATEWAY_SERVICE_TOKEN is missing or too weak for non-development runtime.");
}
