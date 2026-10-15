import { onError } from "@apollo/client/link/error";
import { CombinedGraphQLErrors } from "@apollo/client/errors";

/**
 * Auth-related GraphQL error codes that should trigger session reset.
 * @type {Set<string>}
 */
const AUTH_ERROR_CODES = new Set(["UNAUTHENTICATED"]);

/**
 * Auth-related GraphQL message fragments used as fallback when no code is set.
 * @type {RegExp[]}
 */
const AUTH_MESSAGE_PATTERNS = [/unauthenticated/i, /invalid token/i, /jwt/i, /token expired/i];

/**
 * Determine whether a single GraphQL error indicates authentication/authorization failure.
 *
 * @param {Object} error - GraphQL error object.
 * @returns {boolean}
 */
export const isAuthGraphQLError = (error: unknown): boolean => {
  const errorRecord = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const extensions =
    errorRecord.extensions && typeof errorRecord.extensions === "object"
      ? (errorRecord.extensions as Record<string, unknown>)
      : {};
  const code = extensions.code;
  if (typeof code === "string" && AUTH_ERROR_CODES.has(code.toUpperCase())) {
    return true;
  }

  const message = typeof errorRecord.message === "string" ? errorRecord.message : "";
  return AUTH_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
};

/**
 * Determine whether any GraphQL errors should force logout.
 *
 * @param {Object[]|undefined} graphQLErrors
 * @returns {boolean}
 */
export const shouldForceLogoutOnGraphQLErrors = (graphQLErrors: readonly unknown[] = []) => {
  if (!Array.isArray(graphQLErrors) || graphQLErrors.length === 0) {
    return false;
  }
  return graphQLErrors.some(isAuthGraphQLError);
};

/**
 * Build the headers for a GraphQL request, with the bearer token when there is one.
 *
 * @param {string|null} token
 * @returns {Record<string, string>}
 */
export const buildGraphQLRequestHeaders = (token: string | null): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  headers["Content-Type"] = "application/json";
  return headers;
};

/**
 * Apollo Link that calls `onAuthFailure` when a result carries an auth error. It
 * sits in front of both the HTTP and the SSE link, so a subscription rejected for
 * an expired session ends the session the same way a query does.
 *
 * @param {() => void} onAuthFailure
 */
export const createAuthErrorLink = (onAuthFailure: () => void) =>
  onError(({ error }) => {
    const graphQLErrors = CombinedGraphQLErrors.is(error) ? error.errors : undefined;
    if (shouldForceLogoutOnGraphQLErrors(graphQLErrors)) {
      onAuthFailure();
    }
  });
