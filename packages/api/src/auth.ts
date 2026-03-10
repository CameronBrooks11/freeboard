/**
 * @module auth
 * Authentication and authorization utilities for Freeboard GraphQL API.
 */

import { createGraphQLError } from "graphql-yoga";
import { config } from "./config.js";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import type { ApiContext, UserPrincipal, ServiceAccountPrincipal } from "./context.js";
import { dataStore } from "./data/index.js";

export type AuthTokenClaims = jwt.JwtPayload & {
  _id: string;
  email?: string;
  role?: string;
  admin?: boolean;
  active?: boolean;
  sv?: number;
  sessionVersion?: number;
};

const normalizeJwtExpiry = (value: unknown): NonNullable<jwt.SignOptions["expiresIn"]> => {
  const normalized = String(value ?? "").trim();
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }
  return normalized as StringValue;
};

const ensureJwtPayloadObject = (decoded: string | jwt.JwtPayload): jwt.JwtPayload => {
  if (decoded && typeof decoded === "object") {
    return decoded;
  }
  throw createGraphQLError("Authentication token payload is invalid", {
    extensions: { code: "UNAUTHENTICATED" },
  });
};

/**
 * Ensure the number of registered users does not exceed the configured limit.
 *
 * @param {number} numberOfCurrentlyUsersRegistered - Current count of registered users.
 * @throws {GraphQLError} When the user limit has been reached.
 */
export const ensureLimitOfUsersIsNotReached = (numberOfCurrentlyUsersRegistered: number): void => {
  const usersLimit = config.userLimit;
  if (usersLimit === 0) {
    return;
  }

  if (numberOfCurrentlyUsersRegistered >= usersLimit) {
    throw createGraphQLError(
      "The maximum number of users allowed has been reached. You must contact the administrator of the service in order to register",
    );
  }
};

/**
 * Ensure the request context has an authenticated user.
 *
 * @param {Object} context - GraphQL resolver context containing user info.
 * @throws {GraphQLError} When no authenticated user is present.
 */
export const ensureThatUserIsLogged: (
  context: ApiContext,
) => asserts context is ApiContext & { user: UserPrincipal } = (context) => {
  if (!context.user) {
    throw createGraphQLError("You must be logged in to perform this action", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
};

/**
 * Ensure the authenticated user has administrator privileges.
 *
 * @param {Object} context - GraphQL resolver context containing user info.
 * @throws {GraphQLError} When the user is not an administrator.
 */
export const ensureThatUserIsAdministrator = (context: ApiContext): void => {
  ensureThatUserIsLogged(context);
  if (context.user.role !== "admin") {
    throw createGraphQLError("You must be an administrator to perform this action", {
      extensions: { code: "FORBIDDEN" },
    });
  }
};

/**
 * Ensure the authenticated user has one of the allowed roles.
 *
 * @param {Object} context - GraphQL resolver context containing user info.
 * @param {string[]} allowedRoles - Allowed role values.
 */
export const ensureThatUserHasRole = (context: ApiContext, allowedRoles: string[] = []): void => {
  ensureThatUserIsLogged(context);
  if (!allowedRoles.includes(context.user.role)) {
    throw createGraphQLError("You do not have access to perform this action", {
      extensions: { code: "FORBIDDEN" },
    });
  }
};

/**
 * Ensure the current principal (admin user or scoped service account) can access a scoped operation.
 *
 * @param {Object} context
 * @param {string[]} requiredScopes
 */
export const ensureThatPrincipalHasServiceScope = (
  context: ApiContext,
  requiredScopes: string[] = [],
): void => {
  if (context.user?.role === "admin") {
    return;
  }

  const principal = context.serviceAccount as ServiceAccountPrincipal | undefined;
  if (!principal) {
    throw createGraphQLError("You must be authenticated to perform this action", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  const grantedScopes = new Set(
    Array.isArray(principal.scopes)
      ? principal.scopes.map((scope: unknown) =>
          String(scope || "")
            .trim()
            .toLowerCase(),
        )
      : [],
  );
  const hasScope = requiredScopes.some((scope: string) =>
    grantedScopes.has(
      String(scope || "")
        .trim()
        .toLowerCase(),
    ),
  );
  if (!hasScope) {
    throw createGraphQLError("Service account scope does not allow this action", {
      extensions: { code: "FORBIDDEN" },
    });
  }
};

/**
 * Retrieve the current user document based on the context.
 *
 * @param {Object} context - GraphQL resolver context containing user info.
 * @returns {Promise<Object|null>} The user document or null if no user in context.
 * @throws {GraphQLError} When the user record cannot be found.
 */
export const getUser = async (context: ApiContext) => {
  if (!context.user) {
    return null;
  }

  const _id = context.user._id || null;
  const user = await dataStore.models.User.findOne({ _id }).lean();
  if (!user) {
    throw createGraphQLError("You must be logged in to perform this action");
  }

  return user;
};

/**
 * Create a signed JWT for authentication.
 *
 * @param {string} email       - User email address.
 * @param {string} role        - User role.
 * @param {boolean} active     - Whether the user account is active.
 * @param {string} _id         - User document _id.
 * @param {number} [sessionVersion=0] - Session version for revocation checks.
 * @returns {string}           Signed JWT token.
 */
export const createAuthToken = (
  email: string,
  role: string,
  active: boolean,
  _id: string,
  sessionVersion = 0,
): string => {
  const normalizedRole = String(role || "").toLowerCase();
  const expiresIn = normalizeJwtExpiry(config.jwtTimeExpiration);
  return jwt.sign(
    {
      email,
      role: normalizedRole,
      admin: normalizedRole === "admin",
      active,
      _id,
      sv: Number.isFinite(Number(sessionVersion))
        ? Math.max(0, Math.floor(Number(sessionVersion)))
        : 0,
    },
    config.jwtSecret,
    {
      expiresIn,
    },
  );
};

/**
 * Validate and decode a JWT token.
 *
 * @param {string} token - The JWT token to validate.
 * @returns {Promise<Object>} Decoded token payload containing user claims.
 * @throws {JsonWebTokenError} When the token is invalid or expired.
 */
export const validateAuthToken = async (token: string): Promise<AuthTokenClaims> => {
  const decoded = await jwt.verify(token, config.jwtSecret);
  const payload = ensureJwtPayloadObject(decoded);
  return payload as AuthTokenClaims;
};
