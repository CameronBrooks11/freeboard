/**
 * @module types/DashboardUsableProfiles
 * Dashboard-scoped discovery of the credential/broker profiles a principal may
 * author with (issue #213). Authorized by ACL `canEdit` on the dashboard, so an
 * ACL-only editor (a global viewer with a per-dashboard grant) can populate the
 * datasource form's profile pickers — limited to the profiles a save would allow.
 */

export default `
  type DashboardUsableProfiles {
    credentialProfiles: [CredentialProfile!]!
    brokerProfiles: [BrokerProfile!]!
  }

  extend type Query {
    dashboardUsableProfiles(dashboardId: ID!): DashboardUsableProfiles!
  }
`;
