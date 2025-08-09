/**
 * @module resolvers/merge
 * @description Utility to map Dashboard Mongoose documents to GraphQL response objects.
 */

/**
 * Transform a Dashboard document into a GraphQL-friendly object.
 *
 * @param {Object} u - Raw Dashboard document.
 * @param {any} u._id - Document ID, converted to string.
 * @param {string} u.version - Dashboard version.
 * @param {string} u.title - Dashboard title.
 * @param {boolean} u.published - Publication status.
 * @param {string} [u.image] - Optional image URL.
 * @param {Object[]} [u.datasources] - Datasource configurations.
 * @param {number} [u.columns] - Column count.
 * @param {Object[]} [u.panes] - Pane definitions.
 * @param {string} [u.width] - Layout width.
 * @param {Object[]} [u.authProviders] - Authentication provider settings.
 * @param {Object} [u.settings] - Additional dashboard settings.
 * @param {Date} u.createdAt - Creation timestamp.
 * @param {Date} u.updatedAt - Last update timestamp.
 * @returns {Object} GraphQL Dashboard object.
 */
export const transformDashboard = (u) => ({
  // Convert ObjectId to string for GraphQL
  _id: u._id.toString(),
  version: u.version,
  title: u.title,
  published: u.published,
  image: u.image,
  datasources: u.datasources,
  columns: u.columns,
  panes: u.panes,
  width: u.width,
  authProviders: u.authProviders,
  settings: u.settings,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});
