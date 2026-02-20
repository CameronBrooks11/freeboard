/**
 * @module types/CredentialProfile
 * GraphQL types for server-managed datasource credential profiles.
 */

export default `
  enum CredentialProfileType {
    NONE
    HEADER
    BEARER
    BASIC
  }

  type CredentialProfile {
    _id: ID!
    name: String!
    description: String
    type: CredentialProfileType!
    allowPublicUse: Boolean!
    metadata: Object
    secretShape: Object
    createdAt: String
    updatedAt: String
  }

  input CredentialProfileCreateInput {
    name: String!
    description: String
    type: CredentialProfileType!
    allowPublicUse: Boolean
    metadata: Object
    secret: Object
  }

  input CredentialProfileUpdateInput {
    name: String
    description: String
    type: CredentialProfileType
    allowPublicUse: Boolean
    metadata: Object
    secret: Object
  }

  extend type Query {
    credentialProfiles: [CredentialProfile!]!
  }

  extend type Mutation {
    adminCreateCredentialProfile(input: CredentialProfileCreateInput!): CredentialProfile!
    adminUpdateCredentialProfile(
      _id: ID!
      input: CredentialProfileUpdateInput!
    ): CredentialProfile!
    adminDeleteCredentialProfile(_id: ID!): CredentialProfile!
  }
`;
