/**
 * @module types/DatasourceDiagnostics
 * GraphQL types for admin datasource diagnostics rollup.
 */

export default `
  type DatasourceTypeCount {
    type: String!
    count: Int!
  }

  type DatasourceDiagnostics {
    totalDashboards: Int!
    totalDatasources: Int!
    credentialBoundDatasources: Int!
    externalDashboardDatasources: Int!
    invalidDatasources: Int!
    typeCounts: [DatasourceTypeCount!]!
  }

  extend type Query {
    adminDatasourceDiagnostics: DatasourceDiagnostics!
  }
`;
