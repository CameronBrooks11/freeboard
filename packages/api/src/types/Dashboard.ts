/**
 * @module types/Dashboard
 * GraphQL schema for dashboard visibility, sharing, and collaboration.
 */

export default `
  """Custom scalar for arbitrary JSON-like objects."""
  scalar Object

  """Dashboard ACL access level."""
  enum DashboardAccessLevel {
    VIEWER
    EDITOR
  }

  """Per-dashboard ACL entry."""
  type DashboardAclEntry {
    userId: ID!
    accessLevel: DashboardAccessLevel!
  }

  """Collaborator view with user identity details."""
  type DashboardCollaborator {
    userId: ID!
    email: String
    accessLevel: DashboardAccessLevel!
    isOwner: Boolean!
  }

  """Represents a saved dashboard configuration."""
  type Dashboard {
    _id: ID!
    """Read-only convenience projection of the document title, for list/summary views."""
    title: String
    visibility: DashboardVisibility!
    shareToken: String
    shareTokenVersion: Int!
    document: Object
    """Optimistic-concurrency counter; bumped only when the document changes."""
    documentRevision: Int!
    user: String
    acl: [DashboardAclEntry!]!
    isOwner: Boolean!
    canEdit: Boolean!
    canManageSharing: Boolean!
    createdAt: String
    updatedAt: String
  }

  type Query {
    """Retrieve a single dashboard by ID."""
    dashboard(_id: ID!): Dashboard

    """Retrieve dashboard by opaque share token."""
    dashboardByShareToken(shareToken: String!): Dashboard

    """List dashboards available to the current user."""
    dashboards: [Dashboard]!

    """List collaborators for a dashboard."""
    dashboardCollaborators(_id: ID!): [DashboardCollaborator!]!
  }

  type Mutation {
    """Create a new dashboard."""
    createDashboard(dashboard: CreateDashboardInput): Dashboard!

    """Update an existing dashboard by ID."""
    updateDashboard(_id: ID!, dashboard: UpdateDashboardInput): Dashboard!

    """Delete a dashboard by ID."""
    deleteDashboard(_id: ID!): Dashboard!

    """Set visibility for a dashboard."""
    setDashboardVisibility(_id: ID!, visibility: DashboardVisibility!): Dashboard!

    """Rotate the share token for a dashboard."""
    rotateDashboardShareToken(_id: ID!): Dashboard!

    """Grant or update dashboard ACL access by user email."""
    upsertDashboardAccess(
      _id: ID!
      email: String!
      accessLevel: DashboardAccessLevel!
    ): Dashboard!

    """Revoke dashboard ACL access."""
    revokeDashboardAccess(_id: ID!, userId: ID!): Dashboard!

    """Transfer dashboard ownership."""
    transferDashboardOwnership(_id: ID!, newOwnerUserId: ID!): Dashboard!
  }

  type Subscription {
    """Subscribe to real-time updates for a specific dashboard by ID."""
    dashboard(_id: ID!): Dashboard
  }

  """Input type for creating a new dashboard."""
  input CreateDashboardInput {
    visibility: DashboardVisibility
    document: Object!
  }

  """Input type for updating an existing dashboard."""
  input UpdateDashboardInput {
    visibility: DashboardVisibility
    document: Object
    """
    When updating the document, the revision the client last loaded. The update
    is rejected with a CONFLICT error if the stored document has advanced since.
    """
    expectedDocumentRevision: Int
  }
`;
