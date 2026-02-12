/**
 * @module types/Policy
 * @description GraphQL policy and enum definitions for role/auth policy controls.
 */

export default `
  """Role model used across authz and user management."""
  enum UserRole {
    VIEWER
    EDITOR
    ADMIN
  }

  """Registration mode policy."""
  enum RegistrationMode {
    DISABLED
    INVITE
    OPEN
  }

  """Dashboard execution mode policy."""
  enum ExecutionMode {
    SAFE
    TRUSTED
  }

  """Authentication/registration policy snapshot."""
  type AuthPolicy {
    registrationMode: RegistrationMode!
    registrationDefaultRole: UserRole!
    editorCanPublish: Boolean!
    executionMode: ExecutionMode!
    policyEditLock: Boolean!
  }

  type Query {
    """Publicly accessible auth policy subset for login/registration UX."""
    publicAuthPolicy: AuthPolicy!

    """Admin-visible auth policy snapshot."""
    authPolicy: AuthPolicy!
  }

  type Mutation {
    """Admin-only: update mutable auth policy fields."""
    setAuthPolicy(
      registrationMode: RegistrationMode
      registrationDefaultRole: UserRole
      editorCanPublish: Boolean
      executionMode: ExecutionMode
    ): AuthPolicy!
  }
`;
