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
      published
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      isOwner
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
      published
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      isOwner
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
      published
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      user
      isOwner
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
      published
      image
      datasources
      columns
      width
      panes
      authProviders
      settings
      user
      isOwner
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
 * GraphQL query to fetch a list of dashboards.
 * @constant {import('graphql').DocumentNode} DASHBOARDS_LIST_QUERY
 */
export const DASHBOARDS_LIST_QUERY = gql`
  query Dashboards {
    dashboards {
      _id
      title
      published
    }
  }
`;
