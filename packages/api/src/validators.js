/**
 * @module validators
 * @description Utilities for validating user input such as email format and password strength.
 */

export const EMAIL_POLICY_MESSAGE =
  "Email must be in valid format: name@domain.ext";

export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol";

const EMAIL_VALID_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Normalize an email value for consistent validation/query semantics.
 *
 * @param {string} email - Raw email input.
 * @returns {string} Lowercased, trimmed email or empty string for invalid input.
 */
export const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return "";
  }
  return email.trim().toLowerCase();
};

/**
 * Check if an email address is syntactically valid.
 *
 * @param {string} email - The email address to validate.
 * @returns {boolean} True if the email matches the standard email format; otherwise false.
 */
export const isValidEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }
  return EMAIL_VALID_PATTERN.test(normalizedEmail);
};

/**
 * Check if a password meets defined strength requirements:
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one non-alphanumeric symbol
 * - Minimum length of 12 characters
 *
 * This policy is applied consistently to:
 * - local bootstrap admin (`CREATE_ADMIN=true`)
 * - user self-registration (`registerUser`)
 * - model-level persistence validation (defense in depth)
 *
 * @param {string} password - The password to validate.
 * @returns {boolean} True if the password is strong; otherwise false.
 */
export const isStrongPassword = (password) => {
  if (typeof password !== "string") {
    return false;
  }

  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
};

/**
 * Return user-friendly credential policy hints for API/config error messages.
 *
 * @returns {{ email: string, password: string }}
 */
export const getCredentialPolicyHints = () => ({
  email: EMAIL_POLICY_MESSAGE,
  password: PASSWORD_POLICY_MESSAGE,
});
