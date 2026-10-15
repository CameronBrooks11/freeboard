/**
 * @module context
 * Creates the GraphQL execution context with PubSub and authenticated principal state.
 */

import { createGraphQLError, createPubSub } from "graphql-yoga";
import type { Plugin } from "graphql-yoga";
import type { GraphQLError } from "graphql";
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
  /**
   * Set when the request presented a bearer token that does not authenticate.
   * `useRejectFailedAuthentication` turns it into the operation's only result.
   */
  authenticationError?: GraphQLError;
};

/**
 * Mark the request as failed authentication: a bearer token was presented but is
 * expired, invalid or revoked, or its user no longer exists or is inactive. The
 * request must not continue as anonymous, or the client never learns its session
 * ended (#301).
 */
const rejectPresentedToken = (context: ApiContext): ApiContext => {
  recordAuthFailureMetric();
  context.authenticationError = createGraphQLError(
    "Your session has expired or is no longer valid. Log in again.",
    { extensions: { code: "UNAUTHENTICATED" } },
  );
  return context;
};

/**
 * Answer every operation of a request whose bearer token failed authentication
 * with that `UNAUTHENTICATED` error, before any resolver runs.
 *
 * This is a hook rather than a throw from `setContext` because a context-factory
 * error is only reported cleanly by Yoga's own `/graphql` handler: the
 * graphql-sse endpoint (`/graphql/stream`) turns it into an HTTP 500 with a
 * plain-text stack trace. Stopping execution here gives both transports an
 * ordinary GraphQL result (HTTP 200, `errors[0].extensions.code`). The result
 * carries `data: null` because graphql-sse only recognises an object with a
 * `data` key as a result; without it `/graphql/stream` answers HTTP 400.
 */
export const useRejectFailedAuthentication = (): Plugin => ({
  onExecute({ args, setResultAndStopExecution }) {
    const error = (args.contextValue as Partial<ApiContext>).authenticationError;
    if (error) {
      setResultAndStopExecution({ data: null, errors: [error] });
    }
  },
  onSubscribe({ args, setResultAndStopExecution }) {
    const error = (args.contextValue as Partial<ApiContext>).authenticationError;
    if (error) {
      setResultAndStopExecution({ data: null, errors: [error] });
    }
  },
});

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
          return rejectPresentedToken(context);
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

    let user: AuthTokenClaims;
    try {
      // Validate JWT signature and expiry.
      user = await validateAuthToken(token);
    } catch {
      return rejectPresentedToken(context);
    }

    try {
      const userId = String(user?._id || "").trim();
      const persistedUser = userId
        ? await dataStore.repositories.users.findActiveById({
            userId,
          })
        : null;
      if (!persistedUser) {
        return rejectPresentedToken(context);
      }
      const persistedSessionVersion = Number(
        persistedUser.sessionVersion === undefined ? 0 : persistedUser.sessionVersion,
      );
      const tokenSessionVersion = Number(user?.sv === undefined ? 0 : user.sv);
      if (persistedSessionVersion !== tokenSessionVersion) {
        return rejectPresentedToken(context);
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
      // The token is valid but the user lookup failed (e.g. the database is
      // unreachable): continue without a principal rather than end the session.
      recordAuthFailureMetric();
    }
  }

  return context;
};
