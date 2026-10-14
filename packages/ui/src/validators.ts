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
export const validateRequired = (value: unknown): { error?: string } => {
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
export const validateInteger = (value: unknown): { error?: string } => {
  return Number(value) % 1 === 0 ? {} : { error: "Must be a whole number." };
};

/**
 * Validate that a value is a finite number.
 *
 * @param {*} value - The input value to check.
 * @returns {Object} Empty object if valid number, otherwise an error descriptor.
 */
export const validateNumber = (value: unknown): { error?: string } => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? {} : { error: "Must be a number." };
};

type RangeBounds = { min?: number | undefined; max?: number | undefined };

/**
 * Build a validator that rejects a value outside `min`..`max`, matching the
 * server's manifest range rule: null and undefined pass, and anything else is
 * read with `Number()`, so a blank input counts as 0. Non-numeric input is left
 * to validateNumber / validateInteger, so it reports one error, not two.
 *
 * @param {Object} bounds - The `min` and/or `max` to enforce.
 * @param {Function} formatError - Builds the error message from the bounds.
 * @returns {Function} Validator returning an empty object or an error descriptor.
 */
export const createRangeValidator =
  ({ min, max }: RangeBounds, formatError: (bounds: RangeBounds) => string) =>
  (value: unknown): { error?: string } => {
    if (value === null || value === undefined) {
      return {};
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return {};
    }
    if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
      return { error: formatError({ min, max }) };
    }
    return {};
  };
