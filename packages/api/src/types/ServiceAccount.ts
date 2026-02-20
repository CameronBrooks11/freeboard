/**
 * @module types/ServiceAccount
 * GraphQL schema for service-account lifecycle and operational telemetry.
 */

export default `
  enum ServiceAccountScope {
    DATASOURCE_MINT
    DATASOURCE_DIAGNOSTICS_READ
    OPS_READ
  }

  type ServiceAccount {
    _id: ID!
    name: String!
    description: String!
    active: Boolean!
    scopes: [ServiceAccountScope!]!
    tokenCount: Int!
    createdAt: String
    updatedAt: String
    lastUsedAt: String
  }

  type ServiceAccountTokenRecord {
    _id: ID!
    serviceAccountId: ID!
    label: String
    scopes: [ServiceAccountScope!]!
    tokenPreview: String!
    expiresAt: String
    revokedAt: String
    createdAt: String
    updatedAt: String
    lastUsedAt: String
  }

  type IssuedServiceAccountToken {
    tokenRecord: ServiceAccountTokenRecord!
    token: String!
  }

  type AuditEventRecord {
    _id: ID!
    actorUserId: ID
    action: String!
    targetType: String
    targetId: ID
    metadata: Object
    createdAt: String
    updatedAt: String
  }

  type ApiRuntimeMetrics {
    startedAt: String!
    collectedAt: String!
    uptimeSeconds: Int!
    requestCount: Int!
    errorCount: Int!
    avgLatencyMs: Float!
    p95LatencyMs: Float!
    maxLatencyMs: Float!
    authFailureCount: Int!
    datasourceMintSuccessCount: Int!
    datasourceMintFailureCount: Int!
    auditWriteFailureCount: Int!
  }

  type GatewayRuntimeMetrics {
    startedAt: String!
    collectedAt: String!
    uptimeSeconds: Int!
    httpRequestCount: Int!
    httpErrorCount: Int!
    httpAvgLatencyMs: Float!
    realtimeConnectionAttempts: Int!
    realtimeConnectionsAccepted: Int!
    realtimeConnectionsRejected: Int!
    realtimeActiveConnections: Int!
    realtimeMessagesIn: Int!
    realtimeMessagesOut: Int!
    realtimeErrorCount: Int!
  }

  type AdminRuntimeMetrics {
    collectedAt: String!
    api: ApiRuntimeMetrics!
    gateway: GatewayRuntimeMetrics
  }

  extend type Query {
    adminServiceAccounts: [ServiceAccount!]!
    adminServiceAccountTokens(serviceAccountId: ID!): [ServiceAccountTokenRecord!]!
    adminAuditEvents(limit: Int, actionPrefix: String): [AuditEventRecord!]!
    adminRuntimeMetrics: AdminRuntimeMetrics!
  }

  input ServiceAccountInput {
    name: String!
    description: String
    active: Boolean
    scopes: [ServiceAccountScope!]
  }

  input UpdateServiceAccountInput {
    name: String
    description: String
    active: Boolean
    scopes: [ServiceAccountScope!]
  }

  type Mutation {
    adminCreateServiceAccount(input: ServiceAccountInput!): ServiceAccount!
    adminUpdateServiceAccount(_id: ID!, input: UpdateServiceAccountInput!): ServiceAccount!
    adminDeleteServiceAccount(_id: ID!): ServiceAccount!
    adminIssueServiceAccountToken(
      serviceAccountId: ID!
      label: String
      scopes: [ServiceAccountScope!]
      expiresInHours: Int
    ): IssuedServiceAccountToken!
    adminRotateServiceAccountToken(_id: ID!, expiresInHours: Int): IssuedServiceAccountToken!
    adminRevokeServiceAccountToken(_id: ID!): Boolean!
  }
`;
