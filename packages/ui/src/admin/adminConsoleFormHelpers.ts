/**
 * @module admin/adminConsoleFormHelpers
 * @description Admin console mutation input and formatting helpers.
 */

import { normalizeCredentialProfileTypeValue } from "./adminConsoleState.js";

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

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

export const buildCredentialProfileMutationInput = (
  draft: Record<string, unknown>,
  { includeSecrets = true }: { includeSecrets?: boolean } = {},
) => {
  const source = toRecord(draft);
  const type = normalizeCredentialProfileTypeValue(draft.type);
  const input: Record<string, unknown> = {
    name: String(source.name || "").trim(),
    description: String(source.description || "").trim(),
    type: credentialProfileTypeToEnum(type),
    allowPublicUse: Boolean(source.allowPublicUse),
    metadata: {},
  };

  if (type === "header") {
    input.metadata = {
      headerName: String(source.metadataHeaderName || "").trim(),
    };
  }

  if (!includeSecrets) {
    return input;
  }

  const secret: Record<string, string> = {};
  if (type === "bearer") {
    if (source.secretToken) {
      secret.token = String(source.secretToken);
    }
  } else if (type === "basic") {
    if (source.secretUsername) {
      secret.username = String(source.secretUsername);
    }
    if (source.secretPassword) {
      secret.password = String(source.secretPassword);
    }
  } else if (type === "header") {
    if (source.secretHeaderValue) {
      secret.headerValue = String(source.secretHeaderValue);
    }
  }

  if (Object.keys(secret).length > 0 || type === "none") {
    input.secret = secret;
  }

  return input;
};

export const buildBrokerProfileMutationInput = (draft: unknown) => {
  const source = toRecord(draft);
  const protocol = String(source.protocol || "mqtt").toLowerCase();
  const allowlist = String(source.topicAllowlist || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    name: String(source.name || "").trim(),
    description: String(source.description || "").trim(),
    protocol: brokerProfileProtocolToEnum(protocol),
    brokerUrl: String(source.brokerUrl || "").trim(),
    credentialProfileId: String(source.credentialProfileId || "").trim() || null,
    allowPublicUse: Boolean(source.allowPublicUse),
    topicAllowlist: allowlist,
    tls: {
      rejectUnauthorized: Boolean(source.tlsRejectUnauthorized),
    },
  };
};

export const formatDateTime = (value: unknown) => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString();
};

export const extractErrorMessage = (error: unknown, fallback: string) => {
  const normalizedError = toRecord(error);
  const graphQLErrors = Array.isArray(normalizedError.graphQLErrors)
    ? normalizedError.graphQLErrors
    : [];
  const firstGraphQLError =
    graphQLErrors.length > 0 ? toRecord(graphQLErrors[0]).message : undefined;
  return String(firstGraphQLError || normalizedError.message || fallback);
};
