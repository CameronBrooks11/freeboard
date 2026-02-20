/**
 * @module policy
 * Shared policy constants and normalization helpers.
 */

/** @type {string[]} */
export const USER_ROLES = Object.freeze(["viewer", "editor", "admin"] as const);

/** @type {string[]} */
export const REGISTRATION_MODES = Object.freeze(["disabled", "invite", "open"] as const);

/** @type {string[]} */
export const NON_ADMIN_USER_ROLES = Object.freeze(["viewer", "editor"] as const);

/** @type {string[]} */
export const EXECUTION_MODES = Object.freeze(["safe", "trusted"] as const);

/** @type {string[]} */
export const DASHBOARD_VISIBILITIES = Object.freeze(["private", "link", "public"] as const);

/** @type {string[]} */
export const DASHBOARD_ACCESS_LEVELS = Object.freeze(["viewer", "editor"] as const);

const USER_ROLE_SET = new Set<string>(USER_ROLES);
const NON_ADMIN_USER_ROLE_SET = new Set<string>(NON_ADMIN_USER_ROLES);
const REGISTRATION_MODE_SET = new Set<string>(REGISTRATION_MODES);
const EXECUTION_MODE_SET = new Set<string>(EXECUTION_MODES);
const DASHBOARD_VISIBILITY_SET = new Set<string>(DASHBOARD_VISIBILITIES);
const DASHBOARD_ACCESS_LEVEL_SET = new Set<string>(DASHBOARD_ACCESS_LEVELS);

/**
 * Normalize and validate a role string.
 *
 * @param {string} role
 * @returns {string}
 */
export const normalizeRole = (role: unknown): string => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (!USER_ROLE_SET.has(normalized)) {
    throw new Error(`Invalid role '${role}'. Allowed roles: ${USER_ROLES.join(", ")}`);
  }
  return normalized;
};

/**
 * Normalize and validate a non-admin role string.
 *
 * @param {string} role
 * @returns {string}
 */
export const normalizeNonAdminRole = (role: unknown): string => {
  const normalized = normalizeRole(role);
  if (!NON_ADMIN_USER_ROLE_SET.has(normalized)) {
    throw new Error(
      `Invalid non-admin role '${role}'. Allowed roles: ${NON_ADMIN_USER_ROLES.join(", ")}`,
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
export const normalizeRegistrationMode = (mode: unknown): string => {
  const normalized = String(mode || "")
    .trim()
    .toLowerCase();
  if (!REGISTRATION_MODE_SET.has(normalized)) {
    throw new Error(
      `Invalid registration mode '${mode}'. Allowed modes: ${REGISTRATION_MODES.join(", ")}`,
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
export const normalizeExecutionMode = (mode: unknown): string => {
  const normalized = String(mode || "")
    .trim()
    .toLowerCase();
  if (!EXECUTION_MODE_SET.has(normalized)) {
    throw new Error(
      `Invalid execution mode '${mode}'. Allowed modes: ${EXECUTION_MODES.join(", ")}`,
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
export const normalizeDashboardVisibility = (visibility: unknown): string => {
  const normalized = String(visibility || "")
    .trim()
    .toLowerCase();
  if (!DASHBOARD_VISIBILITY_SET.has(normalized)) {
    throw new Error(
      `Invalid dashboard visibility '${visibility}'. Allowed visibilities: ${DASHBOARD_VISIBILITIES.join(
        ", ",
      )}`,
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
export const normalizeDashboardAccessLevel = (accessLevel: unknown): string => {
  const normalized = String(accessLevel || "")
    .trim()
    .toLowerCase();
  if (!DASHBOARD_ACCESS_LEVEL_SET.has(normalized)) {
    throw new Error(
      `Invalid dashboard access level '${accessLevel}'. Allowed levels: ${DASHBOARD_ACCESS_LEVELS.join(
        ", ",
      )}`,
    );
  }
  return normalized;
};
