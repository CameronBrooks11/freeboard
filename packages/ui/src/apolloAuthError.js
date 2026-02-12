/**
 * Auth-related GraphQL error codes that should trigger session reset.
 * @type {Set<string>}
 */
const AUTH_ERROR_CODES = new Set(["UNAUTHENTICATED", "FORBIDDEN"]);

/**
 * Auth-related GraphQL message fragments used as fallback when no code is set.
 * @type {RegExp[]}
 */
const AUTH_MESSAGE_PATTERNS = [
  /unauthenticated/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid token/i,
  /jwt/i,
];

/**
 * Determine whether a single GraphQL error indicates authentication/authorization failure.
 *
 * @param {Object} error - GraphQL error object.
 * @returns {boolean}
 */
export const isAuthGraphQLError = (error) => {
  const code = error?.extensions?.code;
  if (typeof code === "string" && AUTH_ERROR_CODES.has(code.toUpperCase())) {
    return true;
  }

  const message = typeof error?.message === "string" ? error.message : "";
  return AUTH_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
};

/**
 * Determine whether any GraphQL errors should force logout.
 *
 * @param {Object[]|undefined} graphQLErrors
 * @returns {boolean}
 */
export const shouldForceLogoutOnGraphQLErrors = (graphQLErrors) => {
  if (!Array.isArray(graphQLErrors) || graphQLErrors.length === 0) {
    return false;
  }
  return graphQLErrors.some(isAuthGraphQLError);
};

