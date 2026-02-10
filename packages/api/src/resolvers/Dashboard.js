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

/**
 * Transform and filter a Dashboard document based on the request context.
 *
 * @param {Object} res - Raw Mongoose Dashboard document.
 * @param {Object} context - GraphQL context, may include authenticated user.
 * @returns {Object} Transformed dashboard data appropriate for the user.
 * @throws {GraphQLError} If dashboard not found or access denied.
 */
const getDashboard = (res, context) => {
  if (res) {
    if (context.user) {
      const { user, ...result } = transformDashboard(res);
      // If the dashboard owner matches the requester, omit the user field
      if (user === context.user._id) {
        return result;
      } else {
        return { ...result, user };
      }
    } else {
      if (res.published) {
        // Unauthenticated users only see published dashboards
        return transformDashboard(res);
      } else {
        throw createGraphQLError("Dashboard not found");
      }
    }
  } else {
    throw createGraphQLError("Dashboard not found");
  }
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
      return getDashboard(await Dashboard.findOne({ _id }), context);
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

      return res.map(transformDashboard);
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

      const newDashboard = new Dashboard({
        title: dashboard.title,
        version: dashboard.version,
        published: dashboard.published,
        image: dashboard.image,
        width: dashboard.width,
        columns: dashboard.columns,
        datasources: dashboard.datasources,
        panes: dashboard.panes,
        layout: dashboard.layout,
        authProviders: dashboard.authProviders,
        settings: dashboard.settings,
        user: context.user._id,
      });
      try {
        return newDashboard.save().then(transformDashboard);
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

      const res = await Dashboard.findOne({ _id });

      if (res) {
        return Dashboard.findByIdAndUpdate(
          _id,
          { $set: { ...dashboard } },
          { new: true }
        )
          .then((d) => getDashboard(d, context))
          .then((d) => {
            // Notify subscribers of dashboard updates
            pubSub.publish(`dashboard:${d._id}`, { dashboard: d });
            return d;
          });
      } else {
        throw createGraphQLError("Dashboard not found");
      }
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

      const res = await Dashboard.findOne({ _id, user: context.user._id });
      
      if (res) {
        return Dashboard.findByIdAndDelete(_id).then(transformDashboard);
      } else {
        throw createGraphQLError("Dashboard not found");
      }
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
      subscribe: (_, args) => {
        return pubSub.subscribe(`dashboard:${args._id}`);
      },
    },
  },
};
