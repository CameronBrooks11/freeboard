/**
 * @module gql
 * @description Builds and exports the executable GraphQL schema using type definitions and resolvers.
 */

import { makeExecutableSchema } from "@graphql-tools/schema";

import typeDefs from "./types/index.js";
import resolvers from "./resolvers/index.js";

/**
 * A GraphQL Schema object (executable schema).
 * @typedef {Object} GraphQLSchema
 */

/**
 * The GraphQL executable schema for Freeboard API.
 *
 * Combines SDL type definitions (`typeDefs`) with resolver functions (`resolvers`).
 *
 * @type {GraphQLSchema}
 */
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

export default schema;
