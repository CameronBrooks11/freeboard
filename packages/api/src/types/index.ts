/**
 * @module types/index
 * Aggregates and merges GraphQL type definitions for the Freeboard API.
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
import DashboardUsableProfiles from "./DashboardUsableProfiles.js";
import Datasource from "./Datasource.js";
import DatasourceDiagnostics from "./DatasourceDiagnostics.js";
import ServiceAccount from "./ServiceAccount.js";

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
  DashboardUsableProfiles,
  Datasource,
  DatasourceDiagnostics,
  ServiceAccount,
];

export default /** @type {DocumentNodeAlias} */ mergeTypeDefs(typeDefs);
