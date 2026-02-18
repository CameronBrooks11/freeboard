/**
 * @module admin/adminConsoleFormHelpers
 * @description Admin console mutation input and formatting helpers.
 */

import { normalizeCredentialProfileTypeValue } from "./adminConsoleState.js";

export const roleToEnum = (role) => String(role || "viewer").toUpperCase();
export const registrationModeToEnum = (mode) => String(mode || "disabled").toUpperCase();
export const dashboardVisibilityToEnum = (visibility) =>
  String(visibility || "private").toUpperCase();
export const executionModeToEnum = (mode) => String(mode || "safe").toUpperCase();
export const credentialProfileTypeToEnum = (type) => String(type || "none").toUpperCase();
export const brokerProfileProtocolToEnum = (protocol) => String(protocol || "mqtt").toUpperCase();
export const serviceAccountScopeToEnum = (scope) =>
  String(scope || "")
    .trim()
    .replace(/[:.-]/g, "_")
    .toUpperCase();

export const buildCredentialProfileMutationInput = (draft, { includeSecrets = true } = {}) => {
  const type = normalizeCredentialProfileTypeValue(draft.type);
  const input = {
    name: String(draft.name || "").trim(),
    description: String(draft.description || "").trim(),
    type: credentialProfileTypeToEnum(type),
    allowPublicUse: Boolean(draft.allowPublicUse),
    metadata: {},
  };

  if (type === "header") {
    input.metadata = {
      headerName: String(draft.metadataHeaderName || "").trim(),
    };
  }

  if (!includeSecrets) {
    return input;
  }

  const secret = {};
  if (type === "bearer") {
    if (draft.secretToken) {
      secret.token = String(draft.secretToken);
    }
  } else if (type === "basic") {
    if (draft.secretUsername) {
      secret.username = String(draft.secretUsername);
    }
    if (draft.secretPassword) {
      secret.password = String(draft.secretPassword);
    }
  } else if (type === "header") {
    if (draft.secretHeaderValue) {
      secret.headerValue = String(draft.secretHeaderValue);
    }
  }

  if (Object.keys(secret).length > 0 || type === "none") {
    input.secret = secret;
  }

  return input;
};

export const buildBrokerProfileMutationInput = (draft) => {
  const protocol = String(draft.protocol || "mqtt").toLowerCase();
  const allowlist = String(draft.topicAllowlist || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    name: String(draft.name || "").trim(),
    description: String(draft.description || "").trim(),
    protocol: brokerProfileProtocolToEnum(protocol),
    brokerUrl: String(draft.brokerUrl || "").trim(),
    credentialProfileId: String(draft.credentialProfileId || "").trim() || null,
    allowPublicUse: Boolean(draft.allowPublicUse),
    topicAllowlist: allowlist,
    tls: {
      rejectUnauthorized: Boolean(draft.tlsRejectUnauthorized),
    },
  };
};

export const formatDateTime = (value) => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString();
};

export const extractErrorMessage = (error, fallback) =>
  error?.graphQLErrors?.[0]?.message || error?.message || fallback;
