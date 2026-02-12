/**
 * @module policyStore
 * @description Persistence helpers for auth/registration policy values.
 */

import Policy from "./models/Policy.js";
import { config } from "./config.js";
import {
  normalizeExecutionMode,
  normalizeNonAdminRole,
  normalizeRegistrationMode,
} from "./policy.js";

const POLICY_KEYS = Object.freeze({
  registrationMode: "auth.registration.mode",
  registrationDefaultRole: "auth.registration.defaultRole",
  editorCanPublish: "auth.publish.editorCanPublish",
  executionMode: "app.execution.mode",
});

const readStoredPolicy = async (key) => {
  const record = await Policy.findOne({ key }).lean();
  return record?.value;
};

const writeStoredPolicy = async (key, value, updatedBy = null) => {
  await Policy.findOneAndUpdate(
    { key },
    {
      $set: {
        value,
        updatedBy,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
};

/**
 * Load effective auth policy state from DB with env-backed defaults.
 *
 * @returns {Promise<{
 *  registrationMode: string,
 *  registrationDefaultRole: string,
 *  editorCanPublish: boolean,
 *  executionMode: string,
 *  policyEditLock: boolean
 * }>}
 */
export const getAuthPolicyState = async () => {
  const registrationModeRaw =
    (await readStoredPolicy(POLICY_KEYS.registrationMode)) ?? config.registrationMode;
  const registrationDefaultRoleRaw =
    (await readStoredPolicy(POLICY_KEYS.registrationDefaultRole)) ??
    config.registrationDefaultRole;
  const editorCanPublishRaw =
    (await readStoredPolicy(POLICY_KEYS.editorCanPublish)) ?? config.editorCanPublish;
  const executionModeRaw =
    (await readStoredPolicy(POLICY_KEYS.executionMode)) ?? config.executionMode;

  return {
    registrationMode: normalizeRegistrationMode(registrationModeRaw),
    registrationDefaultRole: normalizeNonAdminRole(registrationDefaultRoleRaw),
    editorCanPublish: Boolean(editorCanPublishRaw),
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
 *  executionMode: string,
 *  policyEditLock: boolean
 * }>}
 */
export const setAuthPolicyState = async (input, actorUserId = null) => {
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
      actorUserId
    );
  }

  if (Object.prototype.hasOwnProperty.call(input, "executionMode")) {
    const value = normalizeExecutionMode(input.executionMode);
    await writeStoredPolicy(POLICY_KEYS.executionMode, value, actorUserId);
  }

  return getAuthPolicyState();
};
