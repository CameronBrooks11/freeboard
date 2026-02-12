/**
 * @module auth/loginMode
 * @description Policy helpers for login/register/invite/reset mode transitions.
 */

export const LOGIN_ACTION_MODES = Object.freeze({
  login: "login",
  register: "register",
  invite: "invite",
  requestReset: "requestReset",
  completeReset: "completeReset",
});

const normalizeRegistrationMode = (registrationMode) => {
  const normalized = String(registrationMode || "").toLowerCase();
  if (["disabled", "invite", "open"].includes(normalized)) {
    return normalized;
  }
  return "disabled";
};

const normalizeToken = (token) => String(token || "").trim();

/**
 * Check whether self-registration should be shown.
 *
 * @param {string} registrationMode
 * @returns {boolean}
 */
export const canCreateAccountForMode = (registrationMode) =>
  normalizeRegistrationMode(registrationMode) === "open";

/**
 * Check whether invite-accept path should be available.
 *
 * @param {Object} input
 * @param {string} input.registrationMode
 * @param {string|undefined|null} input.inviteToken
 * @returns {boolean}
 */
export const canAcceptInviteForMode = ({ registrationMode, inviteToken }) =>
  normalizeRegistrationMode(registrationMode) === "invite" ||
  Boolean(normalizeToken(inviteToken));

/**
 * Resolve effective login action mode after policy/token changes.
 *
 * @param {Object} input
 * @param {string} input.registrationMode
 * @param {string|undefined|null} input.inviteToken
 * @param {string|undefined|null} input.resetToken
 * @param {string} input.currentMode
 * @returns {string}
 */
export const resolveLoginActionMode = ({
  registrationMode,
  inviteToken,
  resetToken,
  currentMode,
}) => {
  if (normalizeToken(resetToken)) {
    return LOGIN_ACTION_MODES.completeReset;
  }
  if (normalizeToken(inviteToken)) {
    return LOGIN_ACTION_MODES.invite;
  }

  const normalizedRegistrationMode = normalizeRegistrationMode(registrationMode);
  if (
    currentMode === LOGIN_ACTION_MODES.register &&
    normalizedRegistrationMode !== "open"
  ) {
    return LOGIN_ACTION_MODES.login;
  }
  if (
    currentMode === LOGIN_ACTION_MODES.invite &&
    normalizedRegistrationMode !== "invite"
  ) {
    return LOGIN_ACTION_MODES.login;
  }

  return currentMode;
};
