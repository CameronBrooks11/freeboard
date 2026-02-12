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
