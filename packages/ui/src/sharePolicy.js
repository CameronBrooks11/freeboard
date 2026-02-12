/**
 * @module sharePolicy
 * @description Pure helpers for share dialog state and fallback link generation.
 */

const normalizeVisibility = (visibility) =>
  String(visibility || "private").trim().toLowerCase();

/**
 * Determine whether dashboard sharing is allowed for the current state.
 *
 * @param {Object} input
 * @param {boolean} input.isSaved
 * @param {string|undefined|null} input.dashboardId
 * @returns {boolean}
 */
export const isDashboardShareable = ({ isSaved, dashboardId }) =>
  Boolean(isSaved && String(dashboardId || "").trim());

/**
 * Build fallback route path used for share URLs.
 *
 * @param {Object} input
 * @param {string|undefined|null} input.visibility
 * @param {string|undefined|null} input.dashboardId
 * @param {string|undefined|null} input.shareToken
 * @returns {string}
 */
export const buildFallbackSharePath = ({
  visibility,
  dashboardId,
  shareToken,
}) => {
  const normalizedVisibility = normalizeVisibility(visibility);
  const normalizedDashboardId = String(dashboardId || "").trim();
  const normalizedShareToken = String(shareToken || "").trim();

  if (normalizedVisibility === "public" && normalizedDashboardId) {
    return `/p/${encodeURIComponent(normalizedDashboardId)}`;
  }

  if (normalizedVisibility === "link" && normalizedShareToken) {
    return `/s/${encodeURIComponent(normalizedShareToken)}`;
  }

  return "";
};
