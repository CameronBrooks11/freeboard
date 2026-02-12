/**
 * @module validators
 * @description Validation functions for UI form inputs.
 */

/**
 * Validate that a required field has a non-empty value.
 *
 * @param {*} value - The input value to check.
 * @returns {Object} Empty object if valid, otherwise an error descriptor.
 */
export const validateRequired = (value) => {
  if (value === null || value === undefined) {
    return { error: "This is required." };
  }

  if (typeof value === "string") {
    return value.trim().length ? {} : { error: "This is required." };
  }

  if (Array.isArray(value)) {
    return value.length ? {} : { error: "This is required." };
  }

  return {};
};

/**
 * Validate that a value is an integer.
 *
 * @param {*} value - The input value to check.
 * @returns {Object} Empty object if valid integer, otherwise an error descriptor.
 */
export const validateInteger = (value) => {
  return value % 1 === 0 ? {} : { error: "Must be a whole number." };
};

/**
 * Validate that a value is a finite number.
 *
 * @param {*} value - The input value to check.
 * @returns {Object} Empty object if valid number, otherwise an error descriptor.
 */
export const validateNumber = (value) => {
  return !isNaN(parseFloat(value)) && isFinite(value)
    ? {}
    : { error: "Must be a number." };
};
