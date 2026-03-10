/**
 * @module policyStore
 * Persistence helpers for auth/registration policy values.
 */

import { config } from "./config.js";
import {
  normalizeDashboardVisibility,
  normalizeExecutionMode,
  normalizeNonAdminRole,
  normalizeRegistrationMode,
} from "./policy.js";
import { dataStore } from "./data/index.js";

const POLICY_KEYS = Object.freeze({
  registrationMode: "auth.registration.mode",
  registrationDefaultRole: "auth.registration.defaultRole",
  editorCanPublish: "auth.publish.editorCanPublish",
  dashboardDefaultVisibility: "dashboard.visibility.default",
  dashboardPublicListingEnabled: "dashboard.listing.public.enabled",
  executionMode: "app.execution.mode",
});

type PolicyInput = Partial<{
  registrationMode: string;
  registrationDefaultRole: string;
  editorCanPublish: boolean;
  dashboardDefaultVisibility: string;
  dashboardPublicListingEnabled: boolean;
  executionMode: string;
}>;

type PolicyState = {
  registrationMode: string;
  registrationDefaultRole: string;
  editorCanPublish: boolean;
  dashboardDefaultVisibility: string;
  dashboardPublicListingEnabled: boolean;
  executionMode: string;
  policyEditLock: boolean;
};

const readStoredPolicy = async (key: string): Promise<unknown> => {
  return dataStore.repositories.policy.readValue({ key });
};

const writeStoredPolicy = async (
  key: string,
  value: unknown,
  updatedBy: string | null = null,
): Promise<void> => {
  await dataStore.repositories.policy.writeValue({ key, value, updatedBy });
};

/**
 * Load effective auth policy state from DB with env-backed defaults.
 *
 * @returns {Promise<{
 *  registrationMode: string,
 *  registrationDefaultRole: string,
 *  editorCanPublish: boolean,
 *  dashboardDefaultVisibility: string,
 *  dashboardPublicListingEnabled: boolean,
 *  executionMode: string,
 *  policyEditLock: boolean
 * }>}
 */
export const getAuthPolicyState = async (): Promise<PolicyState> => {
  const registrationModeRaw =
    (await readStoredPolicy(POLICY_KEYS.registrationMode)) ?? config.registrationMode;
  const registrationDefaultRoleRaw =
    (await readStoredPolicy(POLICY_KEYS.registrationDefaultRole)) ?? config.registrationDefaultRole;
  const editorCanPublishRaw =
    (await readStoredPolicy(POLICY_KEYS.editorCanPublish)) ?? config.editorCanPublish;
  const dashboardDefaultVisibilityRaw =
    (await readStoredPolicy(POLICY_KEYS.dashboardDefaultVisibility)) ??
    config.dashboardDefaultVisibility;
  const dashboardPublicListingEnabledRaw =
    (await readStoredPolicy(POLICY_KEYS.dashboardPublicListingEnabled)) ??
    config.dashboardPublicListingEnabled;
  const executionModeRaw =
    (await readStoredPolicy(POLICY_KEYS.executionMode)) ?? config.executionMode;

  return {
    registrationMode: normalizeRegistrationMode(registrationModeRaw),
    registrationDefaultRole: normalizeNonAdminRole(registrationDefaultRoleRaw),
    editorCanPublish: Boolean(editorCanPublishRaw),
    dashboardDefaultVisibility: normalizeDashboardVisibility(dashboardDefaultVisibilityRaw),
    dashboardPublicListingEnabled: Boolean(dashboardPublicListingEnabledRaw),
    executionMode: normalizeExecutionMode(executionModeRaw),
    policyEditLock: config.policyEditLock,
  };
};

/**
 * Update mutable auth policy values.
 *
 * @param {Object} input
 * @param {string|undefined|null} actorUserId
 * @returns {Promise<{
 *  registrationMode: string,
 *  registrationDefaultRole: string,
 *  editorCanPublish: boolean,
 *  dashboardDefaultVisibility: string,
 *  dashboardPublicListingEnabled: boolean,
 *  executionMode: string,
 *  policyEditLock: boolean
 * }>}
 */
export const setAuthPolicyState = async (
  input: PolicyInput,
  actorUserId: string | null = null,
): Promise<PolicyState> => {
  if (Object.prototype.hasOwnProperty.call(input, "registrationMode")) {
    const value = normalizeRegistrationMode(input.registrationMode);
    await writeStoredPolicy(POLICY_KEYS.registrationMode, value, actorUserId);
  }

  if (Object.prototype.hasOwnProperty.call(input, "registrationDefaultRole")) {
    const value = normalizeNonAdminRole(input.registrationDefaultRole);
    await writeStoredPolicy(POLICY_KEYS.registrationDefaultRole, value, actorUserId);
  }

  if (Object.prototype.hasOwnProperty.call(input, "editorCanPublish")) {
    await writeStoredPolicy(
      POLICY_KEYS.editorCanPublish,
      Boolean(input.editorCanPublish),
      actorUserId,
    );
  }

  if (Object.prototype.hasOwnProperty.call(input, "dashboardDefaultVisibility")) {
    const value = normalizeDashboardVisibility(input.dashboardDefaultVisibility);
    await writeStoredPolicy(POLICY_KEYS.dashboardDefaultVisibility, value, actorUserId);
  }

  if (Object.prototype.hasOwnProperty.call(input, "dashboardPublicListingEnabled")) {
    await writeStoredPolicy(
      POLICY_KEYS.dashboardPublicListingEnabled,
      Boolean(input.dashboardPublicListingEnabled),
      actorUserId,
    );
  }

  if (Object.prototype.hasOwnProperty.call(input, "executionMode")) {
    const value = normalizeExecutionMode(input.executionMode);
    await writeStoredPolicy(POLICY_KEYS.executionMode, value, actorUserId);
  }

  return getAuthPolicyState();
};
