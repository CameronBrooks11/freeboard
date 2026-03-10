/**
 * @module context
 * Creates the GraphQL execution context with PubSub and authenticated principal state.
 */

import { createPubSub } from "graphql-yoga";
import type { IncomingMessage } from "http";
import { validateAuthToken, type AuthTokenClaims } from "./auth.js";
import { authenticateServiceAccountToken } from "./serviceAccountAuth.js";
import { recordAuthFailureMetric } from "./runtimeMetrics.js";
import { config } from "./config.js";
import { deriveClientIp } from "./clientIp.js";
import { dataStore } from "./data/index.js";
import type { DataStore } from "./data/contracts.js";

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
  dataStore: DataStore;
  clientIp: string | null;
  user?: UserPrincipal;
  serviceAccount?: ServiceAccountPrincipal;
};

/**
 * PubSub engine for subscriptions.
 * @typedef {Object} PubSub
 */

/**
 * HTTP request object.
 * @typedef {Object} IncomingMessage
 */

/**
 * @typedef {Object} Context
 * @property {PubSub}         pubsub           - PubSub engine for subscriptions.
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
    dataStore,
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
      const userId = String(user?._id || "").trim();
      const persistedUser = userId
        ? await dataStore.repositories.users.findActiveById({
            userId,
          })
        : null;
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
