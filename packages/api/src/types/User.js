/**
 * @module types/User
 * @description
 * GraphQL SDL (Schema Definition Language) type definitions for the **User** entity.
 * Includes:
 * - Object type definitions for `User` and `Token`
 * - Queries for listing users
 * - Mutations for registration, authentication, and self-deletion
 *
 * @remarks
 * The `User` type represents an application account with authentication and authorization fields.
 */

/**
 * @constant {string} UserSchema
 * @description
 * GraphQL schema definition string for `User`, `Token`, and associated queries/mutations.
 */
export default `
  """Represents an application user account."""
  type User {
    """Unique identifier of the user."""
    _id: ID!

    """User's email address (used for login)."""
    email: String!

    """Indicates whether the user has administrative privileges."""
    admin: Boolean!

    """Indicates whether the account is active."""
    active: Boolean!

    """Date and time when the user registered (ISO 8601 format)."""
    registrationDate: String!

    """Date and time when the user last logged in (ISO 8601 format)."""
    lastLogin: String!
  }

  type Query {
    """Retrieve the list of all registered users."""
    listAllUsers: [User]
  }

  """Represents an authentication or registration token."""
  type Token {
    """JWT or API token string returned after successful authentication."""
    token: String
  }

  type Mutation {
    """Register a new user and return an authentication token."""
    registerUser(email: String!, password: String!): Token

    """Authenticate a user and return an authentication token."""
    authUser(email: String!, password: String!): Token

    """Delete the currently authenticated user's account permanently."""
    deleteMyUserAccount: User!
  }
`;
