/**
 * @module context
 * @description Creates the GraphQL execution context, including PubSub, models, and authenticated user.
 */

import { createPubSub } from "graphql-yoga";
import { validateAuthToken } from "./auth.js";
import User from "./types/User.js";
import Dashboard from "./types/Dashboard.js";

/**
 * PubSub engine for subscriptions.
 * @typedef {Object} PubSub
 */

/**
 * Dashboard model type.
 * @typedef {Object} DashboardModel
 */

/**
 * User model type.
 * @typedef {Object} UserModel
 */

/**
 * HTTP request object.
 * @typedef {Object} IncomingMessage
 */

/**
 * @typedef {Object} Context
 * @property {PubSub}         pubsub           - PubSub engine for subscriptions.
 * @property {Object}         models           - GraphQL models available in resolvers.
 * @property {DashboardModel} models.Dashboard - Dashboard model type.
 * @property {UserModel}      models.User      - User model type.
 * @property {Object}        [user]            - Authenticated user claims, if provided.
 */

/**
 * Set up the context for each GraphQL request.
 *
 * @param {Object}    args           - Resolver arguments.
 * @param {IncomingMessage} args.req - HTTP request object.
 * @returns {Promise<Context>}       The context object passed to all resolvers.
 */
export const setContext = async ({ req }) => {
  const context = {
    pubsub: createPubSub(),
    models: {
      Dashboard,
      User,
    },
  };

  // Extract the Authorization header
  let token = req.headers["authorization"];

  if (token && typeof token === "string") {
    try {
      const authenticationScheme = "Bearer ";
      // Remove 'Bearer ' prefix if present
      if (token.startsWith(authenticationScheme)) {
        token = token.slice(authenticationScheme.length);
      }
      // Validate JWT and attach user claims to context
      const user = await validateAuthToken(token);
      context.user = user; // Add to Apollo Server context the user who is doing the request if auth token is provided and it's a valid token
    } catch (e) {
      // Invalid token: log and continue without user
      console.warn(e);
    }
  }

  return context;
};
