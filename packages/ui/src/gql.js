/**
 * @module gql
 * @description GraphQL operation definitions for dashboards and user authentication used by the Freeboard UI.
 */

import gql from "graphql-tag";

/**
 * GraphQL mutation to create a new dashboard.
 * @constant {import('graphql').DocumentNode} DASHBOARD_CREATE_MUTATION
 */
export const DASHBOARD_CREATE_MUTATION = gql`
  mutation DashboardCreate($dashboard: CreateDashboardInput!) {
    createDashboard(dashboard: $dashboard) {
      _id
      title
      visibility
      shareToken
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      acl {
        userId
        accessLevel
      }
      isOwner
      canEdit
      canManageSharing
    }
  }
`;

/**
 * GraphQL mutation to update an existing dashboard.
 * @constant {import('graphql').DocumentNode} DASHBOARD_UPDATE_MUTATION
 */
export const DASHBOARD_UPDATE_MUTATION = gql`
  mutation DashboardUpdate($id: ID!, $dashboard: UpdateDashboardInput!) {
    updateDashboard(_id: $id, dashboard: $dashboard) {
      _id
      title
      visibility
      shareToken
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      acl {
        userId
        accessLevel
      }
      isOwner
      canEdit
      canManageSharing
    }
  }
`;

/**
 * GraphQL query to fetch a dashboard by its ID.
 * @constant {import('graphql').DocumentNode} DASHBOARD_READ_QUERY
 */
export const DASHBOARD_READ_QUERY = gql`
  query DashboardRead($id: ID!) {
    dashboard(_id: $id) {
      _id
      title
      visibility
      shareToken
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      user
      acl {
        userId
        accessLevel
      }
      isOwner
      canEdit
      canManageSharing
    }
  }
`;

/**
 * GraphQL query to fetch a dashboard by opaque share token.
 * @constant {import('graphql').DocumentNode} DASHBOARD_READ_BY_SHARE_TOKEN_QUERY
 */
export const DASHBOARD_READ_BY_SHARE_TOKEN_QUERY = gql`
  query DashboardReadByShareToken($shareToken: String!) {
    dashboardByShareToken(shareToken: $shareToken) {
      _id
      title
      visibility
      shareToken
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      user
      acl {
        userId
        accessLevel
      }
      isOwner
      canEdit
      canManageSharing
    }
  }
`;

/**
 * GraphQL subscription for live updates to a dashboard.
 * @constant {import('graphql').DocumentNode} DASHBOARD_UPDATE_SUBSCRIPTION
 */
export const DASHBOARD_UPDATE_SUBSCRIPTION = gql`
  subscription onDashboardUpdated($id: ID!) {
    dashboard(_id: $id) {
      _id
      title
      visibility
      shareToken
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      user
      acl {
        userId
        accessLevel
      }
      isOwner
      canEdit
      canManageSharing
    }
  }
`;

/**
 * GraphQL mutation to authenticate a user and obtain a JWT token.
 * @constant {import('graphql').DocumentNode} USER_AUTH_MUTATION
 */
export const USER_AUTH_MUTATION = gql`
  mutation UserAuth($email: String!, $password: String!) {
    authUser(email: $email, password: $password) {
      token
    }
  }
`;

/**
 * GraphQL mutation to self-register a user in open registration mode.
 * @constant {import('graphql').DocumentNode} USER_REGISTER_MUTATION
 */
export const USER_REGISTER_MUTATION = gql`
  mutation UserRegister($email: String!, $password: String!) {
    registerUser(email: $email, password: $password) {
      token
    }
  }
`;

/**
 * Query public auth policy needed by login/registration UX.
 * @constant {import('graphql').DocumentNode} PUBLIC_AUTH_POLICY_QUERY
 */
export const PUBLIC_AUTH_POLICY_QUERY = gql`
  query PublicAuthPolicy {
    publicAuthPolicy {
      registrationMode
      registrationDefaultRole
      editorCanPublish
      dashboardDefaultVisibility
      dashboardPublicListingEnabled
      executionMode
      policyEditLock
    }
  }
`;

/**
 * Query for currently authenticated user.
 * @constant {import('graphql').DocumentNode} CURRENT_USER_QUERY
 */
export const CURRENT_USER_QUERY = gql`
  query CurrentUser {
    me {
      _id
      email
      role
      active
    }
  }
`;

/**
 * Admin query for user management.
 * @constant {import('graphql').DocumentNode} ADMIN_USERS_QUERY
 */
export const ADMIN_USERS_QUERY = gql`
  query AdminUsers {
    listAllUsers {
      _id
      email
      role
      active
      registrationDate
      lastLogin
    }
  }
`;

/**
 * Admin query for mutable auth policy snapshot.
 * @constant {import('graphql').DocumentNode} AUTH_POLICY_QUERY
 */
export const AUTH_POLICY_QUERY = gql`
  query AuthPolicy {
    authPolicy {
      registrationMode
      registrationDefaultRole
      editorCanPublish
      dashboardDefaultVisibility
      dashboardPublicListingEnabled
      executionMode
      policyEditLock
    }
  }
`;

/**
 * Admin mutation for creating users.
 * @constant {import('graphql').DocumentNode} ADMIN_CREATE_USER_MUTATION
 */
export const ADMIN_CREATE_USER_MUTATION = gql`
  mutation AdminCreateUser(
    $email: String!
    $password: String!
    $role: UserRole!
    $active: Boolean
  ) {
    adminCreateUser(email: $email, password: $password, role: $role, active: $active) {
      _id
      email
      role
      active
      registrationDate
      lastLogin
    }
  }
`;

/**
 * Admin mutation for updating users.
 * @constant {import('graphql').DocumentNode} ADMIN_UPDATE_USER_MUTATION
 */
export const ADMIN_UPDATE_USER_MUTATION = gql`
  mutation AdminUpdateUser($id: ID!, $role: UserRole, $active: Boolean) {
    adminUpdateUser(_id: $id, role: $role, active: $active) {
      _id
      email
      role
      active
      registrationDate
      lastLogin
    }
  }
`;

/**
 * Admin mutation for deleting users.
 * @constant {import('graphql').DocumentNode} ADMIN_DELETE_USER_MUTATION
 */
export const ADMIN_DELETE_USER_MUTATION = gql`
  mutation AdminDeleteUser($id: ID!) {
    adminDeleteUser(_id: $id) {
      _id
    }
  }
`;

/**
 * Admin mutation for auth policy management.
 * @constant {import('graphql').DocumentNode} SET_AUTH_POLICY_MUTATION
 */
export const SET_AUTH_POLICY_MUTATION = gql`
  mutation SetAuthPolicy(
    $registrationMode: RegistrationMode
    $registrationDefaultRole: UserRole
    $editorCanPublish: Boolean
    $dashboardDefaultVisibility: DashboardVisibility
    $dashboardPublicListingEnabled: Boolean
    $executionMode: ExecutionMode
  ) {
    setAuthPolicy(
      registrationMode: $registrationMode
      registrationDefaultRole: $registrationDefaultRole
      editorCanPublish: $editorCanPublish
      dashboardDefaultVisibility: $dashboardDefaultVisibility
      dashboardPublicListingEnabled: $dashboardPublicListingEnabled
      executionMode: $executionMode
    ) {
      registrationMode
      registrationDefaultRole
      editorCanPublish
      dashboardDefaultVisibility
      dashboardPublicListingEnabled
      executionMode
      policyEditLock
    }
  }
`;

/**
 * Admin query for pending invitation list.
 * @constant {import('graphql').DocumentNode} ADMIN_PENDING_INVITES_QUERY
 */
export const ADMIN_PENDING_INVITES_QUERY = gql`
  query AdminPendingInvites {
    listPendingInvites {
      _id
      email
      role
      expiresAt
      createdAt
    }
  }
`;

/**
 * Admin mutation for invite creation.
 * @constant {import('graphql').DocumentNode} ADMIN_CREATE_INVITE_MUTATION
 */
export const ADMIN_CREATE_INVITE_MUTATION = gql`
  mutation AdminCreateInvite($email: String!, $role: UserRole!, $expiresInHours: Int) {
    adminCreateInvite(email: $email, role: $role, expiresInHours: $expiresInHours) {
      token
      invite {
        _id
        email
        role
        expiresAt
        createdAt
      }
    }
  }
`;

/**
 * Admin mutation for invite revocation.
 * @constant {import('graphql').DocumentNode} ADMIN_REVOKE_INVITE_MUTATION
 */
export const ADMIN_REVOKE_INVITE_MUTATION = gql`
  mutation AdminRevokeInvite($id: ID!) {
    adminRevokeInvite(_id: $id)
  }
`;

/**
 * Accept invite token and bootstrap account.
 * @constant {import('graphql').DocumentNode} ACCEPT_INVITE_MUTATION
 */
export const ACCEPT_INVITE_MUTATION = gql`
  mutation AcceptInvite($token: String!, $password: String!) {
    acceptInvite(token: $token, password: $password) {
      token
    }
  }
`;

/**
 * Initiate password reset request.
 * @constant {import('graphql').DocumentNode} REQUEST_PASSWORD_RESET_MUTATION
 */
export const REQUEST_PASSWORD_RESET_MUTATION = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

/**
 * Complete password reset with one-time token.
 * @constant {import('graphql').DocumentNode} RESET_PASSWORD_MUTATION
 */
export const RESET_PASSWORD_MUTATION = gql`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

/**
 * Admin-only password reset token issuance.
 * @constant {import('graphql').DocumentNode} ADMIN_ISSUE_PASSWORD_RESET_MUTATION
 */
export const ADMIN_ISSUE_PASSWORD_RESET_MUTATION = gql`
  mutation AdminIssuePasswordReset($id: ID!, $expiresInHours: Int) {
    adminIssuePasswordReset(_id: $id, expiresInHours: $expiresInHours) {
      userId
      token
      expiresAt
    }
  }
`;

/**
 * GraphQL query to fetch a list of dashboards.
 * @constant {import('graphql').DocumentNode} DASHBOARDS_LIST_QUERY
 */
export const DASHBOARDS_LIST_QUERY = gql`
  query Dashboards {
    dashboards {
      _id
      title
      visibility
      isOwner
      canEdit
    }
  }
`;

/**
 * Query collaborators for a dashboard.
 * @constant {import('graphql').DocumentNode} DASHBOARD_COLLABORATORS_QUERY
 */
export const DASHBOARD_COLLABORATORS_QUERY = gql`
  query DashboardCollaborators($id: ID!) {
    dashboardCollaborators(_id: $id) {
      userId
      email
      accessLevel
      isOwner
    }
  }
`;

/**
 * Update dashboard visibility.
 * @constant {import('graphql').DocumentNode} DASHBOARD_SET_VISIBILITY_MUTATION
 */
export const DASHBOARD_SET_VISIBILITY_MUTATION = gql`
  mutation SetDashboardVisibility($id: ID!, $visibility: DashboardVisibility!) {
    setDashboardVisibility(_id: $id, visibility: $visibility) {
      _id
      visibility
      shareToken
      isOwner
      canEdit
      canManageSharing
    }
  }
`;

/**
 * Rotate dashboard share token.
 * @constant {import('graphql').DocumentNode} DASHBOARD_ROTATE_SHARE_TOKEN_MUTATION
 */
export const DASHBOARD_ROTATE_SHARE_TOKEN_MUTATION = gql`
  mutation RotateDashboardShareToken($id: ID!) {
    rotateDashboardShareToken(_id: $id) {
      _id
      visibility
      shareToken
      isOwner
      canManageSharing
    }
  }
`;

/**
 * Upsert dashboard collaborator access by email.
 * @constant {import('graphql').DocumentNode} DASHBOARD_UPSERT_ACCESS_MUTATION
 */
export const DASHBOARD_UPSERT_ACCESS_MUTATION = gql`
  mutation UpsertDashboardAccess(
    $id: ID!
    $email: String!
    $accessLevel: DashboardAccessLevel!
  ) {
    upsertDashboardAccess(_id: $id, email: $email, accessLevel: $accessLevel) {
      _id
      acl {
        userId
        accessLevel
      }
      canManageSharing
    }
  }
`;

/**
 * Revoke dashboard collaborator access.
 * @constant {import('graphql').DocumentNode} DASHBOARD_REVOKE_ACCESS_MUTATION
 */
export const DASHBOARD_REVOKE_ACCESS_MUTATION = gql`
  mutation RevokeDashboardAccess($id: ID!, $userId: ID!) {
    revokeDashboardAccess(_id: $id, userId: $userId) {
      _id
      acl {
        userId
        accessLevel
      }
      canManageSharing
    }
  }
`;

/**
 * Transfer dashboard ownership.
 * @constant {import('graphql').DocumentNode} DASHBOARD_TRANSFER_OWNERSHIP_MUTATION
 */
export const DASHBOARD_TRANSFER_OWNERSHIP_MUTATION = gql`
  mutation TransferDashboardOwnership($id: ID!, $newOwnerUserId: ID!) {
    transferDashboardOwnership(_id: $id, newOwnerUserId: $newOwnerUserId) {
      _id
      user
      isOwner
      canEdit
      canManageSharing
      acl {
        userId
        accessLevel
      }
    }
  }
`;
