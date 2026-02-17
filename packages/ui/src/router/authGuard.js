/**
 * @module router/authGuard
 * @description Pure helpers for authentication/authorization route guard decisions.
 */

const AUTH_ENTRY_ROUTE_NAMES = new Set(["Login", "InviteAccept", "PasswordReset"]);
const PUBLIC_ROUTE_NAMES = new Set(["SharedDashboard", "PublicDashboard"]);

/**
 * Check if route name is an authentication entry point.
 *
 * @param {string|symbol|null|undefined} routeName
 * @returns {boolean}
 */
export const isAuthEntryRoute = (routeName) => {
  if (typeof routeName !== "string") {
    return false;
  }
  return AUTH_ENTRY_ROUTE_NAMES.has(routeName);
};

/**
 * Resolve auth/admin redirect decision for a navigation target.
 *
 * @param {Object} input
 * @param {string|symbol|null|undefined} input.routeName
 * @param {boolean} [input.requiresAdmin=false]
 * @param {boolean} [input.isLoggedIn=false]
 * @param {boolean} [input.isAdmin=false]
 * @returns {{name: "Login"|"Home"}|null}
 */
export const resolveAuthNavigation = ({
  routeName,
  requiresAdmin = false,
  isLoggedIn = false,
  isAdmin = false,
}) => {
  const authEntry = isAuthEntryRoute(routeName);
  const publicRoute = typeof routeName === "string" && PUBLIC_ROUTE_NAMES.has(routeName);
  if (!isLoggedIn && !authEntry && !publicRoute) {
    return { name: "Login" };
  }
  if (isLoggedIn && authEntry) {
    return { name: "Home" };
  }
  if (requiresAdmin && !isAdmin) {
    return { name: "Home" };
  }
  return null;
};

/**
 * Route-level wrapper for Vue Router guards.
 *
 * @param {Object} args
 * @param {Object} args.to
 * @param {string|symbol|null|undefined} args.to.name
 * @param {Object|undefined} args.to.meta
 * @param {boolean|undefined} args.to.meta.requiresAdmin
 * @param {boolean} args.isLoggedIn
 * @param {boolean} args.isAdmin
 * @returns {{name: "Login"|"Home"}|null}
 */
export const resolveNavigationGuard = ({ to, isLoggedIn, isAdmin }) =>
  resolveAuthNavigation({
    routeName: to?.name,
    requiresAdmin: Boolean(to?.meta?.requiresAdmin),
    isLoggedIn,
    isAdmin,
  });
