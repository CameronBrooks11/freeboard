/**
 * @module types/BrokerProfile
 * GraphQL types for broker profile management.
 */

export default `
  enum BrokerProfileProtocol {
    MQTT
  }

  type BrokerProfile {
    _id: ID!
    name: String!
    description: String
    protocol: BrokerProfileProtocol!
    brokerUrl: String!
    tls: Object
    credentialProfileId: String
    allowPublicUse: Boolean!
    topicAllowlist: [String!]!
    createdAt: String
    updatedAt: String
  }

  input BrokerProfileCreateInput {
    name: String!
    description: String
    protocol: BrokerProfileProtocol
    brokerUrl: String!
    tls: Object
    credentialProfileId: ID
    allowPublicUse: Boolean
    topicAllowlist: [String!]
  }

  input BrokerProfileUpdateInput {
    name: String
    description: String
    protocol: BrokerProfileProtocol
    brokerUrl: String
    tls: Object
    credentialProfileId: ID
    allowPublicUse: Boolean
    topicAllowlist: [String!]
  }

  extend type Query {
    brokerProfiles(protocol: BrokerProfileProtocol): [BrokerProfile!]!
  }

  extend type Mutation {
    adminCreateBrokerProfile(input: BrokerProfileCreateInput!): BrokerProfile!
    adminUpdateBrokerProfile(_id: ID!, input: BrokerProfileUpdateInput!): BrokerProfile!
    adminDeleteBrokerProfile(_id: ID!): BrokerProfile!
  }
`;
