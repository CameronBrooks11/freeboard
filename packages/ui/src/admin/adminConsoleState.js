/**
 * @module admin/adminConsoleState
 * @description Normalization helpers for Admin Console form state and options.
 */

export const ROLE_OPTIONS = Object.freeze(["viewer", "editor", "admin"]);
export const REGISTRATION_DEFAULT_ROLE_OPTIONS = Object.freeze(["viewer", "editor"]);
export const INVITE_ROLE_OPTIONS = Object.freeze(["viewer", "editor"]);
export const REGISTRATION_MODE_OPTIONS = Object.freeze(["disabled", "invite", "open"]);
export const DASHBOARD_VISIBILITY_OPTIONS = Object.freeze(["private", "link", "public"]);
export const EXECUTION_MODE_OPTIONS = Object.freeze(["safe", "trusted"]);

const normalizeOptionValue = (value, allowed, fallback) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
};

export const normalizeRoleValue = (value) =>
  normalizeOptionValue(value, ROLE_OPTIONS, "viewer");

export const normalizeRegistrationDefaultRoleValue = (value) =>
  normalizeOptionValue(value, REGISTRATION_DEFAULT_ROLE_OPTIONS, "viewer");

export const normalizeRegistrationModeValue = (value) =>
  normalizeOptionValue(value, REGISTRATION_MODE_OPTIONS, "disabled");

export const normalizeDashboardVisibilityValue = (value) =>
  normalizeOptionValue(value, DASHBOARD_VISIBILITY_OPTIONS, "private");

export const normalizeExecutionModeValue = (value) =>
  normalizeOptionValue(value, EXECUTION_MODE_OPTIONS, "safe");

export const toUserDraft = (user = {}) => ({
  role: normalizeRoleValue(user.role),
  active: Boolean(user.active),
});

export const toPolicyDraft = (policy = {}) => ({
  registrationMode: normalizeRegistrationModeValue(policy.registrationMode),
  registrationDefaultRole: normalizeRegistrationDefaultRoleValue(
    policy.registrationDefaultRole
  ),
  editorCanPublish: Boolean(policy.editorCanPublish),
  dashboardDefaultVisibility: normalizeDashboardVisibilityValue(
    policy.dashboardDefaultVisibility
  ),
  dashboardPublicListingEnabled: Boolean(policy.dashboardPublicListingEnabled),
  executionMode: normalizeExecutionModeValue(policy.executionMode),
  policyEditLock: Boolean(policy.policyEditLock),
});
