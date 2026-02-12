/**
 * @module policy
 * @description Shared policy constants and normalization helpers.
 */

/** @type {readonly string[]} */
export const USER_ROLES = Object.freeze(["viewer", "editor", "admin"]);

/** @type {readonly string[]} */
export const REGISTRATION_MODES = Object.freeze(["disabled", "invite", "open"]);

/** @type {readonly string[]} */
export const NON_ADMIN_USER_ROLES = Object.freeze(["viewer", "editor"]);

/** @type {readonly string[]} */
export const EXECUTION_MODES = Object.freeze(["safe", "trusted"]);

/** @type {readonly string[]} */
export const DASHBOARD_VISIBILITIES = Object.freeze(["private", "link", "public"]);

/** @type {readonly string[]} */
export const DASHBOARD_ACCESS_LEVELS = Object.freeze(["viewer", "editor"]);

/**
 * Normalize and validate a role string.
 *
 * @param {string} role
 * @returns {string}
 */
export const normalizeRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (!USER_ROLES.includes(normalized)) {
    throw new Error(
      `Invalid role '${role}'. Allowed roles: ${USER_ROLES.join(", ")}`
    );
  }
  return normalized;
};

/**
 * Normalize and validate a non-admin role string.
 *
 * @param {string} role
 * @returns {string}
 */
export const normalizeNonAdminRole = (role) => {
  const normalized = normalizeRole(role);
  if (!NON_ADMIN_USER_ROLES.includes(normalized)) {
    throw new Error(
      `Invalid non-admin role '${role}'. Allowed roles: ${NON_ADMIN_USER_ROLES.join(
        ", "
      )}`
    );
  }
  return normalized;
};

/**
 * Normalize and validate a registration mode string.
 *
 * @param {string} mode
 * @returns {string}
 */
export const normalizeRegistrationMode = (mode) => {
  const normalized = String(mode || "").trim().toLowerCase();
  if (!REGISTRATION_MODES.includes(normalized)) {
    throw new Error(
      `Invalid registration mode '${mode}'. Allowed modes: ${REGISTRATION_MODES.join(
        ", "
      )}`
    );
  }
  return normalized;
};

/**
 * Normalize and validate an execution mode string.
 *
 * @param {string} mode
 * @returns {string}
 */
export const normalizeExecutionMode = (mode) => {
  const normalized = String(mode || "").trim().toLowerCase();
  if (!EXECUTION_MODES.includes(normalized)) {
    throw new Error(
      `Invalid execution mode '${mode}'. Allowed modes: ${EXECUTION_MODES.join(
        ", "
      )}`
    );
  }
  return normalized;
};

/**
 * Normalize and validate dashboard visibility value.
 *
 * @param {string} visibility
 * @returns {string}
 */
export const normalizeDashboardVisibility = (visibility) => {
  const normalized = String(visibility || "").trim().toLowerCase();
  if (!DASHBOARD_VISIBILITIES.includes(normalized)) {
    throw new Error(
      `Invalid dashboard visibility '${visibility}'. Allowed visibilities: ${DASHBOARD_VISIBILITIES.join(
        ", "
      )}`
    );
  }
  return normalized;
};

/**
 * Normalize and validate dashboard ACL access level value.
 *
 * @param {string} accessLevel
 * @returns {string}
 */
export const normalizeDashboardAccessLevel = (accessLevel) => {
  const normalized = String(accessLevel || "").trim().toLowerCase();
  if (!DASHBOARD_ACCESS_LEVELS.includes(normalized)) {
    throw new Error(
      `Invalid dashboard access level '${accessLevel}'. Allowed levels: ${DASHBOARD_ACCESS_LEVELS.join(
        ", "
      )}`
    );
  }
  return normalized;
};
