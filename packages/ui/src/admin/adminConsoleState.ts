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
export const CREDENTIAL_PROFILE_TYPE_OPTIONS = Object.freeze(["none", "header", "bearer", "basic"]);
export const BROKER_PROFILE_PROTOCOL_OPTIONS = Object.freeze(["mqtt"]);
export const SERVICE_ACCOUNT_SCOPE_OPTIONS = Object.freeze([
  "datasource:mint",
  "datasource:diagnostics:read",
  "ops:read",
]);

const normalizeOptionValue = (value, allowed, fallback) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
};

export const normalizeRoleValue = (value) => normalizeOptionValue(value, ROLE_OPTIONS, "viewer");

export const normalizeRegistrationDefaultRoleValue = (value) =>
  normalizeOptionValue(value, REGISTRATION_DEFAULT_ROLE_OPTIONS, "viewer");

export const normalizeRegistrationModeValue = (value) =>
  normalizeOptionValue(value, REGISTRATION_MODE_OPTIONS, "disabled");

export const normalizeDashboardVisibilityValue = (value) =>
  normalizeOptionValue(value, DASHBOARD_VISIBILITY_OPTIONS, "private");

export const normalizeExecutionModeValue = (value) =>
  normalizeOptionValue(value, EXECUTION_MODE_OPTIONS, "safe");

export const normalizeCredentialProfileTypeValue = (value) =>
  normalizeOptionValue(value, CREDENTIAL_PROFILE_TYPE_OPTIONS, "none");

export const normalizeBrokerProfileProtocolValue = (value) =>
  normalizeOptionValue(value, BROKER_PROFILE_PROTOCOL_OPTIONS, "mqtt");

export const toUserDraft = (user = {}) => ({
  role: normalizeRoleValue(user.role),
  active: Boolean(user.active),
});

export const toPolicyDraft = (policy = {}) => ({
  registrationMode: normalizeRegistrationModeValue(policy.registrationMode),
  registrationDefaultRole: normalizeRegistrationDefaultRoleValue(policy.registrationDefaultRole),
  editorCanPublish: Boolean(policy.editorCanPublish),
  dashboardDefaultVisibility: normalizeDashboardVisibilityValue(policy.dashboardDefaultVisibility),
  dashboardPublicListingEnabled: Boolean(policy.dashboardPublicListingEnabled),
  executionMode: normalizeExecutionModeValue(policy.executionMode),
  policyEditLock: Boolean(policy.policyEditLock),
});

export const toCredentialProfileDraft = (profile = {}) => ({
  name: String(profile.name || ""),
  description: String(profile.description || ""),
  type: normalizeCredentialProfileTypeValue(profile.type),
  allowPublicUse: Boolean(profile.allowPublicUse),
  metadataHeaderName: String(profile.metadata?.headerName || ""),
  secretToken: "",
  secretUsername: "",
  secretPassword: "",
  secretHeaderValue: "",
});

export const toBrokerProfileDraft = (profile = {}) => ({
  name: String(profile.name || ""),
  description: String(profile.description || ""),
  protocol: normalizeBrokerProfileProtocolValue(profile.protocol),
  brokerUrl: String(profile.brokerUrl || ""),
  credentialProfileId: String(profile.credentialProfileId || ""),
  allowPublicUse: Boolean(profile.allowPublicUse),
  topicAllowlist: Array.isArray(profile.topicAllowlist) ? profile.topicAllowlist.join(", ") : "",
  tlsRejectUnauthorized:
    profile.tls?.rejectUnauthorized === undefined ? true : Boolean(profile.tls.rejectUnauthorized),
});

export const toServiceAccountDraft = (account = {}) => ({
  name: String(account.name || ""),
  description: String(account.description || ""),
  active: account.active === undefined ? true : Boolean(account.active),
  scopes: Array.isArray(account.scopes)
    ? account.scopes
        .map((scope) =>
          String(scope || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [],
});
