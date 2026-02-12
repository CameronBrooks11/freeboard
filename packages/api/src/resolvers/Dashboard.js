/**
 * @module resolvers/Dashboard
 * @description GraphQL resolver implementations for Dashboard operations.
 */

/**
 * @typedef {Object} IResolvers
 *   Alias for the resolver map type from @graphql-tools/utils.
 *
 * @typedef {Object} GraphQLResolveInfo
 *   Alias for GraphQLResolveInfo from graphql.
 */

import { createGraphQLError, createPubSub } from "graphql-yoga";
import { ensureThatUserIsLogged } from "../auth.js";
import Dashboard from "../models/Dashboard.js";

import { transformDashboard } from "./merge.js";

const pubSub = createPubSub();
const DASHBOARD_MUTABLE_FIELDS = new Set([
  "title",
  "version",
  "published",
  "image",
  "datasources",
  "columns",
  "width",
  "panes",
  "authProviders",
  "settings",
]);

const sanitizeDashboardInput = (dashboard = {}) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(dashboard || {})) {
    if (DASHBOARD_MUTABLE_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const canReadDashboard = (dashboard, context) => {
  if (!dashboard) {
    return false;
  }

  if (dashboard.published) {
    return true;
  }

  if (!context.user) {
    return false;
  }

  return dashboard.user === context.user._id;
};

const canManageDashboard = (dashboard, context) => {
  if (!dashboard || !context.user) {
    return false;
  }

  return dashboard.user === context.user._id;
};

/**
 * Transform and filter a Dashboard document based on read authorization.
 *
 * @param {Object} res - Raw Mongoose Dashboard document.
 * @param {Object} context - GraphQL context, may include authenticated user.
 * @returns {Object} Transformed dashboard data appropriate for the user.
 * @throws {GraphQLError} If dashboard not found or access denied.
 */
const getDashboard = (res, context) => {
  if (!canReadDashboard(res, context)) {
    throw createGraphQLError("Dashboard not found");
  }

  return transformDashboard(res, context.user?._id || null);
};

export default /** @type {IResolvers} */ {
  Query: {
    /**
     * Fetch a single dashboard by its ID.
     *
     * @param {any} parent
     * @param {{ _id: string }} args - Dashboard ID.
     * @param {Object} context - GraphQL context containing user info.
     * @returns {Promise<Object>} The requested dashboard.
     */
    dashboard: async (parent, { _id }, context) => {
      const dashboard = await Dashboard.findOne({ _id }).lean();
      return getDashboard(dashboard, context);
    },

    /**
     * Fetch all dashboards belonging to the authenticated user.
     *
     * @param {any} parent
     * @param {any} args
     * @param {Object} context - GraphQL context containing user info.
     * @returns {Promise<Object[]>} List of user's dashboards.
     */
    dashboards: async (parent, args, context) => {
      ensureThatUserIsLogged(context);
      const res = await Dashboard.find({ user: context.user._id })
        .populate()
        .exec();

      return res.map((dashboard) =>
        transformDashboard(dashboard, context.user?._id || null)
      );
    },
  },

  Mutation: {
    /**
     * Create a new dashboard for the authenticated user.
     *
     * @param {any} parent
     * @param {{ dashboard: any }} args - Dashboard input data.
     * @param {Object} context - GraphQL context containing user info.
     * @returns {Promise<Object>} The created dashboard.
     */
    createDashboard: async (parent, { dashboard }, context) => {
      ensureThatUserIsLogged(context);

      const sanitizedDashboard = sanitizeDashboardInput(dashboard);
      const newDashboard = new Dashboard({
        ...sanitizedDashboard,
        user: context.user._id,
      });
      try {
        return newDashboard
          .save()
          .then((dashboard) =>
            transformDashboard(dashboard, context.user?._id || null)
          );
      } catch (error) {
        console.error(error);
        throw error;
      }
    },

    /**
     * Update an existing dashboard and publish change event.
     *
     * @param {any} parent
     * @param {{ _id: string, dashboard: any }} args - Dashboard ID and update data.
     * @param {Object} context - GraphQL context containing user info.
     * @returns {Promise<Object>} The updated dashboard.
     */
    updateDashboard: async (parent, { _id, dashboard }, context) => {
      ensureThatUserIsLogged(context);

      const sanitizedDashboard = sanitizeDashboardInput(dashboard);
      const updated = await Dashboard.findOneAndUpdate(
        { _id, user: context.user._id },
        { $set: sanitizedDashboard },
        { new: true, runValidators: true }
      ).lean();

      if (!updated || !canManageDashboard(updated, context)) {
        throw createGraphQLError("Dashboard not found");
      }

      const transformed = transformDashboard(updated, context.user?._id || null);
      // Notify owner-scoped subscribers of dashboard updates.
      pubSub.publish(`dashboard:${transformed._id}`, { dashboard: transformed });
      return transformed;
    },

    /**
     * Delete a dashboard owned by the authenticated user.
     *
     * @param {any} parent
     * @param {{ _id: string }} args - Dashboard ID.
     * @param {Object} context - GraphQL context containing user info.
     * @returns {Promise<Object>} The deleted dashboard data.
     */
    deleteDashboard: async (parent, { _id }, context) => {
      ensureThatUserIsLogged(context);

      const deleted = await Dashboard.findOneAndDelete({
        _id,
        user: context.user._id,
      }).lean();

      if (!deleted || !canManageDashboard(deleted, context)) {
        throw createGraphQLError("Dashboard not found");
      }

      return transformDashboard(deleted, context.user?._id || null);
    },
  },

  Subscription: {
    dashboard: {
      /**
       * Subscribe to real-time updates for a specific dashboard.
       *
      * @param {any} _
      * @param {{ _id: string }} args - Dashboard ID.
      * @returns {AsyncIterable<any>} Subscription iterator.
      */
      subscribe: async (_, args, context) => {
        ensureThatUserIsLogged(context);

        const dashboard = await Dashboard.findOne({ _id: args._id }).lean();
        if (!canManageDashboard(dashboard, context)) {
          throw createGraphQLError("Dashboard not found");
        }

        return pubSub.subscribe(`dashboard:${args._id}`);
      },
    },
  },
};
