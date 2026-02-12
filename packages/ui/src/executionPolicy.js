/**
 * @module executionPolicy
 * @description Helpers for reading runtime safe/trusted execution policy in UI runtime code.
 */

const EXECUTION_MODE_GLOBAL_KEY = "__FREEBOARD_RUNTIME_EXECUTION_MODE__";
const TRUSTED_MODE = "trusted";
const SAFE_MODE = "safe";

const normalizeExecutionMode = (mode) =>
  String(mode || SAFE_MODE).toLowerCase() === TRUSTED_MODE
    ? TRUSTED_MODE
    : SAFE_MODE;

/**
 * Set runtime execution mode for widget/runtime policy checks.
 *
 * @param {string} mode
 */
export const setRuntimeExecutionMode = (mode) => {
  globalThis[EXECUTION_MODE_GLOBAL_KEY] = normalizeExecutionMode(mode);
};

/**
 * Clear runtime execution mode override (primarily for tests).
 */
export const clearRuntimeExecutionMode = () => {
  delete globalThis[EXECUTION_MODE_GLOBAL_KEY];
};

/**
 * Determine whether trusted execution features are currently enabled.
 *
 * @returns {boolean}
 */
export const isTrustedExecutionEnabled = () =>
  normalizeExecutionMode(globalThis[EXECUTION_MODE_GLOBAL_KEY]) === TRUSTED_MODE;
