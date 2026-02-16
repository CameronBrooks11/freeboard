/**
 * @module types/index
 * @description Aggregates and merges GraphQL type definitions for the Freeboard API.
 */

/**
 * @typedef {any} DocumentNodeAlias
 *   Alias for GraphQL.js DocumentNode AST.
 */

import { mergeTypeDefs } from "@graphql-tools/merge";

import Dashboard from "./Dashboard.js";
import User from "./User.js";
import Policy from "./Policy.js";
import CredentialProfile from "./CredentialProfile.js";
import BrokerProfile from "./BrokerProfile.js";
import Datasource from "./Datasource.js";
import DatasourceDiagnostics from "./DatasourceDiagnostics.js";

/**
 * Array of GraphQL SDL strings for each type module.
 *
 * @type {string[]}
 */
const typeDefs = [
  Dashboard,
  User,
  Policy,
  CredentialProfile,
  BrokerProfile,
  Datasource,
  DatasourceDiagnostics,
];

// NOTE: 2nd param is optional, and defaults to false
// Only use if you have defined the same type multiple times in
// different files and wish to attempt merging them together.
// Use { all: true } to merge duplicate type definitions across modules.
export default /** @type {DocumentNodeAlias} */ mergeTypeDefs(typeDefs, {
  all: true,
});
