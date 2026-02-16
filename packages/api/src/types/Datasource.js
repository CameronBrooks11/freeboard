/**
 * @module types/Datasource
 * @description GraphQL types for datasource runtime session token minting.
 */

export default `
  type DatasourceSessionToken {
    token: String!
    expiresAt: String!
  }

  extend type Mutation {
    mintDatasourceSessionToken(
      dashboardId: ID!
      datasourceId: ID!
      shareToken: String
    ): DatasourceSessionToken!
  }
`;
