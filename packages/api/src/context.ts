/**
 * @module context
 * Creates the GraphQL execution context, including PubSub, models, and authenticated user.
 */

import { createPubSub } from "graphql-yoga";
import type { IncomingMessage } from "http";
import { validateAuthToken, type AuthTokenClaims } from "./auth.js";
import User from "./models/User.js";
import Dashboard from "./models/Dashboard.js";
import { authenticateServiceAccountToken } from "./serviceAccountAuth.js";
import { recordAuthFailureMetric } from "./runtimeMetrics.js";
import { config } from "./config.js";
import { deriveClientIp } from "./clientIp.js";

export type ServiceAccountPrincipal = {
  _id: unknown;
  name: string;
  active: boolean;
  scopes: unknown[];
  tokenId: unknown;
};

export type UserPrincipal = AuthTokenClaims & {
  role: string;
  admin: boolean;
  sessionVersion: number;
};

export type ApiContext = {
  pubsub: ReturnType<typeof createPubSub>;
  models: { Dashboard: typeof Dashboard; User: typeof User };
  clientIp: string | null;
  user?: UserPrincipal;
  serviceAccount?: ServiceAccountPrincipal;
};

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
export const setContext = async ({
  req,
}: {
  req: IncomingMessage & { ip?: string };
}): Promise<ApiContext> => {
  const clientIp = deriveClientIp(req, {
    trustProxyHops: config.apiTrustProxyHops,
    warningPrefix: "API context warning: ",
  });

  const context: ApiContext = {
    pubsub: createPubSub(),
    models: {
      Dashboard,
      User,
    },
    clientIp,
  };

  // Extract the Authorization header
  let token = req.headers["authorization"];

  if (token && typeof token === "string") {
    const authenticationScheme = "Bearer ";
    // Remove 'Bearer ' prefix if present
    if (token.startsWith(authenticationScheme)) {
      token = token.slice(authenticationScheme.length);
    }

    if (token.startsWith("fsa_")) {
      try {
        const serviceAuth = await authenticateServiceAccountToken(token);
        if (!serviceAuth) {
          recordAuthFailureMetric();
          return context;
        }
        context.serviceAccount = {
          _id: serviceAuth.serviceAccount._id,
          name: serviceAuth.serviceAccount.name,
          active: serviceAuth.serviceAccount.active,
          scopes: serviceAuth.scopes,
          tokenId: serviceAuth.tokenRecord._id,
        };
      } catch {
        recordAuthFailureMetric();
      }
      return context;
    }

    try {
      // Validate JWT and attach user claims to context
      const user: AuthTokenClaims = await validateAuthToken(token);
      const persistedUser = await User.findOne({
        _id: user?._id,
        active: true,
      }).lean();
      if (!persistedUser) {
        recordAuthFailureMetric();
        return context;
      }
      const persistedSessionVersion = Number(
        persistedUser.sessionVersion === undefined ? 0 : persistedUser.sessionVersion,
      );
      const tokenSessionVersion = Number(user?.sv === undefined ? 0 : user.sv);
      if (persistedSessionVersion !== tokenSessionVersion) {
        recordAuthFailureMetric();
        return context;
      }
      const normalizedRole =
        typeof persistedUser?.role === "string"
          ? persistedUser.role.toLowerCase()
          : user?.admin
            ? "admin"
            : "viewer";
      context.user = {
        ...user,
        _id: persistedUser._id,
        email: persistedUser.email,
        active: persistedUser.active,
        role: normalizedRole,
        admin: normalizedRole === "admin",
        sessionVersion: persistedSessionVersion,
      };
    } catch {
      // Invalid token: continue without principal.
      recordAuthFailureMetric();
    }
  }

  return context;
};
