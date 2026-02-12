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
import { ensureThatUserHasRole, ensureThatUserIsLogged } from "../auth.js";
import Dashboard from "../models/Dashboard.js";
import { getAuthPolicyState } from "../policyStore.js";
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

  if (context.user.role === "admin") {
    return true;
  }

  return dashboard.user === context.user._id;
};

const canManageDashboard = (dashboard, context) => {
  if (!dashboard || !context.user) {
    return false;
  }

  if (context.user.role === "admin") {
    return true;
  }

  return dashboard.user === context.user._id;
};

const ensurePublishPermission = async (inputDashboard, existingDashboard, context) => {
  if (!context.user || context.user.role === "admin") {
    return;
  }

  const hasPublishedField = Object.prototype.hasOwnProperty.call(
    inputDashboard || {},
    "published"
  );
  if (!hasPublishedField) {
    return;
  }

  const nextPublished = inputDashboard?.published === true;
  const previousPublished = existingDashboard?.published === true;
  if (nextPublished === previousPublished) {
    return;
  }

  const authPolicy = await getAuthPolicyState();
  if (!authPolicy.editorCanPublish) {
    throw createGraphQLError("Editors are not allowed to publish dashboards", {
      extensions: { code: "FORBIDDEN" },
    });
  }
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
     * Fetch dashboards scoped by user role.
     *
     * @param {any} parent
     * @param {any} args
     * @param {Object} context - GraphQL context containing user info.
     * @returns {Promise<Object[]>} List of dashboards.
     */
    dashboards: async (parent, args, context) => {
      ensureThatUserIsLogged(context);
      const filter = context.user.role === "admin" ? {} : { user: context.user._id };
      const dashboards = await Dashboard.find(filter).lean();
      return dashboards.map((dashboard) =>
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
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const sanitizedDashboard = sanitizeDashboardInput(dashboard);
      await ensurePublishPermission(sanitizedDashboard, null, context);

      const newDashboard = new Dashboard({
        ...sanitizedDashboard,
        user: context.user._id,
      });

      const created = await newDashboard.save();
      return transformDashboard(created, context.user?._id || null);
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
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const existing = await Dashboard.findOne({ _id }).lean();
      if (!canManageDashboard(existing, context)) {
        throw createGraphQLError("Dashboard not found");
      }

      const sanitizedDashboard = sanitizeDashboardInput(dashboard);
      await ensurePublishPermission(sanitizedDashboard, existing, context);

      const updated = await Dashboard.findOneAndUpdate(
        { _id },
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
      ensureThatUserHasRole(context, ["editor", "admin"]);

      const existing = await Dashboard.findOne({ _id }).lean();
      if (!canManageDashboard(existing, context)) {
        throw createGraphQLError("Dashboard not found");
      }

      const deleted = await Dashboard.findOneAndDelete({ _id }).lean();
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
