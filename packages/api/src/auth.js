/**
 * @module auth
 * @description Authentication and authorization utilities for Freeboard GraphQL API.
 */

import { createGraphQLError } from "graphql-yoga";
import User from "./models/User.js";
import { config } from "./config.js";
import jwt from "jsonwebtoken";

/**
 * Ensure the number of registered users does not exceed the configured limit.
 *
 * @param {number} numberOfCurrentlyUsersRegistered - Current count of registered users.
 * @throws {GraphQLError} When the user limit has been reached.
 */
export const ensureLimitOfUsersIsNotReached = (
  numberOfCurrentlyUsersRegistered,
) => {
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
export const ensureThatUserIsLogged = (context) => {
  if (!context.user) {
    throw createGraphQLError(
      "You must be logged in to perform this action",
      {
        extensions: { code: "UNAUTHENTICATED" },
      },
    );
  }
};

/**
 * Ensure the authenticated user has administrator privileges.
 *
 * @param {Object} context - GraphQL resolver context containing user info.
 * @throws {GraphQLError} When the user is not an administrator.
 */
export const ensureThatUserIsAdministrator = (context) => {
  ensureThatUserIsLogged(context);
  if (context.user.role !== "admin") {
    throw createGraphQLError(
      "You must be an administrator to perform this action",
      {
        extensions: { code: "FORBIDDEN" },
      }
    );
  }
};

/**
 * Ensure the authenticated user has one of the allowed roles.
 *
 * @param {Object} context - GraphQL resolver context containing user info.
 * @param {string[]} allowedRoles - Allowed role values.
 */
export const ensureThatUserHasRole = (context, allowedRoles = []) => {
  ensureThatUserIsLogged(context);
  if (!allowedRoles.includes(context.user.role)) {
    throw createGraphQLError("You do not have access to perform this action", {
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
export const getUser = async (context) => {
  if (!context.user) {
    return null;
  }

  const _id = context.user._id || null;
  const user = await User.findOne({ _id }).lean();
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
  email,
  role,
  active,
  _id,
  sessionVersion = 0
) => {
  const normalizedRole = String(role || "").toLowerCase();
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
    expiresIn: config.jwtTimeExpiration,
    }
  );
};

/**
 * Validate and decode a JWT token.
 *
 * @param {string} token - The JWT token to validate.
 * @returns {Promise<Object>} Decoded token payload containing user claims.
 * @throws {JsonWebTokenError} When the token is invalid or expired.
 */
export const validateAuthToken = async (token) => {
  const user = await jwt.verify(token, config.jwtSecret);
  return user;
};
