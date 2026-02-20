/**
 * @module gateway/gatewayApiClient
 * Internal API calls and session-token validation.
 */

import jwt from "jsonwebtoken";
import {
  GATEWAY_INTROSPECTION_URL,
  GATEWAY_LIMITER_CONSUME_URL,
  GATEWAY_LIMITER_TIMEOUT_MS,
  GATEWAY_REVOKED_TOKENS_URL,
  GATEWAY_SERVICE_TOKEN,
  INTROSPECTION_TIMEOUT_MS,
  JWT_GATEWAY_SECRET,
  REVOKED_TOKENS_TIMEOUT_MS,
} from "./runtimeConfig.js";
import { createClientError } from "./errors.js";

type JsonObject = Record<string, unknown>;

type SessionClaims = jwt.JwtPayload & {
  scope?: string;
  dashboardId?: string;
  datasourceId?: string;
  sub?: string;
  intentHash?: string;
  shareTokenVersion?: number;
};

type FetchJsonParams = {
  url: string;
  body: JsonObject;
  timeoutMs: number;
  fetchFn?: typeof fetch;
};

type FetchIntrospectionParams = {
  sessionToken: string;
  dashboardId: string;
  datasourceId: string;
  fetchFn?: typeof fetch;
};

type FetchRevokedTokensParams = {
  sinceCursor?: string | null;
  limit: number;
  fetchFn?: typeof fetch;
};

type ConsumeLimiterParams = {
  scope: string;
  key: string;
  limitPerMinute: number;
  fetchFn?: typeof fetch;
};

export type DatasourceIntrospectionResponse = {
  scope?: string;
  intent?: Record<string, unknown>;
};

export type RevokedTokenEvent = {
  dashboardId?: string;
  shareTokenVersion?: number;
};

export type RevokedTokensFeedResponse = {
  nextCursor?: string | null;
  cursorExpired?: boolean;
  events?: RevokedTokenEvent[];
};

export type GatewayLimiterConsumeResponse = {
  allowed?: boolean;
  retryAfterMs?: number;
  remaining?: number;
  reason?: string;
};

export const validateSessionToken = (
  token: string,
  { expectedScope = null }: { expectedScope?: string | null } = {},
): SessionClaims => {
  let claims;
  try {
    claims = jwt.verify(token, JWT_GATEWAY_SECRET, {
      algorithms: ["HS256"],
      audience: "freeboard-gateway",
      issuer: "freeboard-api",
    });
  } catch {
    throw createClientError(401, "Invalid datasource session token");
  }

  const resolvedClaims = claims as SessionClaims;

  if (expectedScope && String(resolvedClaims.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch");
  }

  return resolvedClaims;
};

const fetchJson = async <T extends object>({
  url,
  body,
  timeoutMs,
  fetchFn = fetch,
}: FetchJsonParams): Promise<T> => {
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => {
      abortController.abort();
    },
    Math.max(500, timeoutMs),
  );

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${GATEWAY_SERVICE_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
    ) {
      throw createClientError(504, "Internal API request timed out");
    }
    throw createClientError(502, "Internal API request failed");
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok) {
    const errorMessage =
      typeof payload.error === "string" ? payload.error : "Internal API request failed";
    throw createClientError(response.status, errorMessage);
  }

  return payload as T;
};

export const fetchIntrospection = async ({
  sessionToken,
  dashboardId,
  datasourceId,
  fetchFn = fetch,
}: FetchIntrospectionParams): Promise<DatasourceIntrospectionResponse> =>
  fetchJson<DatasourceIntrospectionResponse>({
    url: GATEWAY_INTROSPECTION_URL,
    body: {
      sessionToken,
      dashboardId,
      datasourceId,
    },
    timeoutMs: INTROSPECTION_TIMEOUT_MS,
    fetchFn,
  });

export const fetchRevokedTokens = async ({
  sinceCursor,
  limit,
  fetchFn = fetch,
}: FetchRevokedTokensParams): Promise<RevokedTokensFeedResponse> =>
  fetchJson<RevokedTokensFeedResponse>({
    url: GATEWAY_REVOKED_TOKENS_URL,
    body: {
      sinceCursor,
      limit,
    },
    timeoutMs: REVOKED_TOKENS_TIMEOUT_MS,
    fetchFn,
  });

export const consumeGatewayLimiter = async ({
  scope,
  key,
  limitPerMinute,
  fetchFn = fetch,
}: ConsumeLimiterParams): Promise<GatewayLimiterConsumeResponse> =>
  fetchJson<GatewayLimiterConsumeResponse>({
    url: GATEWAY_LIMITER_CONSUME_URL,
    body: {
      scope,
      key,
      limitPerMinute: Math.max(1, Math.floor(Number(limitPerMinute) || 1)),
    },
    timeoutMs: GATEWAY_LIMITER_TIMEOUT_MS,
    fetchFn,
  });
