/**
 * @module validators
 * @description Utilities for validating user input such as email format and password strength.
 */

/**
 * Check if an email address is syntactically valid.
 *
 * @param {string} email - The email address to validate.
 * @returns {boolean} True if the email matches the standard email format; otherwise false.
 */
export const isValidEmail = (email) => {
  if (!email) {
    return false;
  }
  // Regular expression matching most common email patterns
  const emailValidPattern = new RegExp(
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
  );
  return emailValidPattern.test(email);
};

/**
 * Check if a password meets defined strength requirements:
 * - At least one digit
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - Minimum length of 8 characters
 *
 * @param {string} password - The password to validate.
 * @returns {boolean} True if the password is strong; otherwise false.
 */
export const isStrongPassword = (password) => {
  if (!password) {
    return false;
  }
  // Pattern enforces digits, lowercase, uppercase, and allowed special characters
  const passwordValidPattern = new RegExp(
    /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z!*^?+\-_@#$%&]{8,}$/
  );
  return passwordValidPattern.test(password);
};
