/**
 * @module sharePolicy
 * @description Pure helpers for share dialog state and fallback link generation.
 */

const DASHBOARD_VISIBILITIES = new Set(["private", "link", "public"]);

/**
 * Map a visibility read from the API, which sends the `DashboardVisibility`
 * enum name (`PRIVATE`/`LINK`/`PUBLIC`), to the lowercase value the UI holds
 * and selects. Anything else is null, so a caller keeps its own fallback.
 *
 * @param {unknown} visibility
 * @returns {string|null}
 */
export const normalizeDashboardVisibility = (visibility: unknown): string | null => {
  const normalized = String(visibility ?? "")
    .trim()
    .toLowerCase();
  return DASHBOARD_VISIBILITIES.has(normalized) ? normalized : null;
};

/**
 * Convert the UI's lowercase visibility to the API's `DashboardVisibility`
 * enum name for a mutation argument.
 *
 * @param {string|null|undefined} visibility
 * @returns {string}
 */
export const visibilityToEnum = (visibility: string | null | undefined): string =>
  String(visibility || "private").toUpperCase();

/**
 * Determine whether dashboard sharing is allowed for the current state.
 *
 * @param {Object} input
 * @param {boolean} input.isSaved
 * @param {string|undefined|null} input.dashboardId
 * @returns {boolean}
 */
export const isDashboardShareable = ({
  isSaved,
  dashboardId,
}: {
  isSaved: boolean;
  dashboardId: string | null | undefined;
}): boolean => Boolean(isSaved && String(dashboardId || "").trim());

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
}: {
  visibility: string | null | undefined;
  dashboardId: string | null | undefined;
  shareToken: string | null | undefined;
}): string => {
  const normalizedVisibility = normalizeDashboardVisibility(visibility);
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
