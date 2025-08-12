/**
 * @module types/Dashboard
 * @description
 * GraphQL SDL (Schema Definition Language) type definitions for the **Dashboard** entity.
 * Includes:
 * - Scalar definitions
 * - Object type definitions
 * - Queries
 * - Mutations
 * - Subscriptions
 * - Input types for creation and updates
 *
 * @remarks
 * The `Dashboard` type represents the persisted configuration of a dashboard in the Freeboard system,
 * including its layout, datasources, and user settings.
 *
 */

/**
 * @constant {string} DashboardSchema
 * @description
 * GraphQL schema definition string for the Dashboard entity.
 * Defines all fields, available queries, mutations, subscriptions, and input types.
 */
export default `
  """Custom scalar for arbitrary JSON-like objects."""
  scalar Object

  """Represents a saved dashboard configuration."""
  type Dashboard {
    """Unique identifier of the dashboard."""
    _id: ID!

    """Human-readable title of the dashboard."""
    title: String!

    """Version identifier for dashboard structure."""
    version: String!

    """Publication state of the dashboard."""
    published: Boolean!

    """Optional preview image (Base64 or URL)."""
    image: String

    """List of data sources used by the dashboard."""
    datasources: [Object]

    """Number of columns in the dashboard grid."""
    columns: Int

    """Fixed width of the dashboard layout."""
    width: String

    """List of dashboard panes (widgets + positions)."""
    panes: [Object]

    """Authentication providers required for access."""
    authProviders: [Object]

    """Additional dashboard-level settings."""
    settings: Object

    """ID or username of the dashboard owner."""
    user: String
  }

  type Query {
    """Retrieve a single dashboard by ID."""
    dashboard(_id: ID!): Dashboard

    """Get list of all dashboards saved in the database."""
    dashboards: [Dashboard]!
  }

  type Mutation {
    """Create a new dashboard."""
    createDashboard(dashboard: CreateDashboardInput): Dashboard!

    """Update an existing dashboard by ID."""
    updateDashboard(_id: ID!, dashboard: UpdateDashboardInput): Dashboard!

    """Delete a dashboard by ID."""
    deleteDashboard(_id: ID!): Dashboard!
  }

  type Subscription {
    """Subscribe to real-time updates for a specific dashboard by ID."""
    dashboard(_id: ID!): Dashboard
  }

  """Input type for creating a new dashboard."""
  input CreateDashboardInput {
    title: String!
    version: String!
    published: Boolean!
    image: String
    datasources: [Object]
    columns: Int
    width: String
    panes: [Object]
    authProviders: [Object]
    settings: Object
    user: String
  }

  """Input type for updating an existing dashboard."""
  input UpdateDashboardInput {
    title: String
    version: String
    published: Boolean
    image: String
    datasources: [Object]
    columns: Int
    width: String
    panes: [Object]
    authProviders: [Object]
    settings: Object
    user: String
  }
`;
