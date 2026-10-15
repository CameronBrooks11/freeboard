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
  const visibility = canPublish ? dashboard.visibility : "private";
  return visibility === undefined
    ? dashboard
    : { ...dashboard, visibility: String(visibility).toUpperCase() };
};
