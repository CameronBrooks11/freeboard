/**
 * @module auth/publishPolicy
 * @description Helpers for publish-policy aware dashboard payload normalization.
 */

/**
 * Normalize create-dashboard payload based on caller publish capability.
 *
 * The create mutation takes the API's `DashboardVisibility` enum name
 * (`PRIVATE`/`LINK`/`PUBLIC`), while the model holds the lowercase value.
 *
 * A dashboard with no chosen visibility (null, undefined or empty) is sent
 * without one, so the server applies the admin default visibility and its
 * publish check. A chosen visibility is sent as the enum name; a caller who
 * may not publish sends `PRIVATE`, which the server would otherwise reject
 * for `LINK`/`PUBLIC`.
 *
 * @param {Object} input
 * @param {Object} input.dashboard
 * @param {boolean} input.canPublish
 * @returns {Object}
 */
export const normalizeCreateDashboardPayload = ({
  dashboard,
  canPublish,
}: {
  dashboard: Record<string, unknown>;
  canPublish: boolean;
}) => {
  const { visibility, ...rest } = dashboard;
  if (visibility === undefined || visibility === null || visibility === "") {
    return rest;
  }
  return { ...rest, visibility: canPublish ? String(visibility).toUpperCase() : "PRIVATE" };
};
