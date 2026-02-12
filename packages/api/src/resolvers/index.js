/**
 * @module resolvers/index
 * @description Aggregates and merges GraphQL resolver definitions for Freeboard API.
 */

/**
 * @typedef {Object} IResolvers
 *   Alias for the resolver map type from @graphql-tools/utils.
 *
 * @typedef {Object} IResolversArray
 *   Alias for an array of resolver maps.
 */

import { mergeResolvers } from "@graphql-tools/merge";

import Dashboard from "./Dashboard.js";
import User from "./User.js";
import Policy from "./Policy.js";

/**
 * Array of individual resolver objects to be merged.
 *
 * @type {IResolversArray}
 */
const resolvers = [Dashboard, User, Policy];

/**
 * Merges all resolver modules into a single resolver map for the executable schema.
 *
 * @type {IResolvers}
 */
export default mergeResolvers(resolvers);
