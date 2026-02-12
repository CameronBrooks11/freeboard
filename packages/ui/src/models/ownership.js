/**
 * Resolve dashboard ownership flag for the current viewer payload.
 *
 * @param {Object} [dashboard={}] - Dashboard payload.
 * @returns {boolean}
 */
export const resolveDashboardIsOwner = (dashboard = {}) => {
  if (typeof dashboard.isOwner === "boolean") {
    return dashboard.isOwner;
  }
  return !dashboard.user;
};

