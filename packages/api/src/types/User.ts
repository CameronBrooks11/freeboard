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

    """Role of the user."""
    role: UserRole!

    """Indicates whether the account is active."""
    active: Boolean!

    """Date and time when the user registered (ISO 8601 format)."""
    registrationDate: String!

    """Date and time when the user last logged in (ISO 8601 format)."""
    lastLogin: String!
  }

  """Invite metadata without exposing secret token hash."""
  type Invite {
    _id: ID!
    email: String!
    role: UserRole!
    expiresAt: String!
    revokedAt: String
    acceptedAt: String
    createdAt: String!
  }

  """One-time invite token payload issued to administrators."""
  type InviteToken {
    invite: Invite!
    token: String!
  }

  """One-time password reset token payload issued to administrators."""
  type PasswordResetToken {
    userId: ID!
    token: String!
    expiresAt: String!
  }

  type Query {
    """Retrieve the list of all registered users."""
    listAllUsers: [User]

    """Retrieve the currently authenticated user."""
    me: User

    """Admin-only: list unexpired invites."""
    listPendingInvites: [Invite]!
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

    """Admin-only: create a new user with an explicit role."""
    adminCreateUser(email: String!, password: String!, role: UserRole!, active: Boolean): User!

    """Admin-only: update an existing user's role and/or active state."""
    adminUpdateUser(_id: ID!, role: UserRole, active: Boolean): User!

    """Admin-only: delete a user account."""
    adminDeleteUser(_id: ID!): User!

    """Admin-only: create an invitation token for a new account."""
    adminCreateInvite(email: String!, role: UserRole!, expiresInHours: Int): InviteToken!

    """Admin-only: revoke a pending invitation token."""
    adminRevokeInvite(_id: ID!): Boolean!

    """Accept an invitation token and create a new account."""
    acceptInvite(token: String!, password: String!): Token

    """Initiate password reset (always returns true)."""
    requestPasswordReset(email: String!): Boolean!

    """Complete password reset with a valid one-time token."""
    resetPassword(token: String!, password: String!): Boolean!

    """Admin-only: issue password reset token for a user."""
    adminIssuePasswordReset(_id: ID!, expiresInHours: Int): PasswordResetToken!
  }
`;
