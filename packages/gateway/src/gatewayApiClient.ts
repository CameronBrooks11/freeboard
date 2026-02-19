/**
 * @module gateway/gatewayApiClient
 * @description Internal API calls and session-token validation.
 */

import jwt from "jsonwebtoken";
import {
  GATEWAY_INTROSPECTION_URL,
  GATEWAY_REVOKED_TOKENS_URL,
  GATEWAY_SERVICE_TOKEN,
  INTROSPECTION_TIMEOUT_MS,
  JWT_GATEWAY_SECRET,
  REVOKED_TOKENS_TIMEOUT_MS,
} from "./runtimeConfig.js";
import { createClientError } from "./errors.js";

export const validateSessionToken = (token, { expectedScope = null } = {}) => {
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

  if (expectedScope && String(claims?.scope || "") !== expectedScope) {
    throw createClientError(403, "Datasource token scope mismatch");
  }

  return claims;
};

const fetchJson = async ({ url, body, timeoutMs, fetchFn = fetch }) => {
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

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createClientError(response.status, payload?.error || "Internal API request failed");
  }

  return payload;
};

export const fetchIntrospection = async ({
  sessionToken,
  dashboardId,
  datasourceId,
  fetchFn = fetch,
}) =>
  fetchJson({
    url: GATEWAY_INTROSPECTION_URL,
    body: {
      sessionToken,
      dashboardId,
      datasourceId,
    },
    timeoutMs: INTROSPECTION_TIMEOUT_MS,
    fetchFn,
  });

export const fetchRevokedTokens = async ({ sinceCursor, limit, fetchFn = fetch }) =>
  fetchJson({
    url: GATEWAY_REVOKED_TOKENS_URL,
    body: {
      sinceCursor,
      limit,
    },
    timeoutMs: REVOKED_TOKENS_TIMEOUT_MS,
    fetchFn,
  });
