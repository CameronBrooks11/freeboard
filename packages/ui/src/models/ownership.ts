/**
 * Resolve dashboard ownership flag for the current viewer payload.
 *
 * @param {Object} [dashboard={}] - Dashboard payload.
 * @returns {boolean}
 */
export const resolveDashboardIsOwner = (dashboard: Record<string, unknown> = {}) => {
  if (typeof dashboard.isOwner === "boolean") {
    return dashboard.isOwner;
  }
  return !dashboard.user;
};
