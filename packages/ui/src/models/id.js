/**
 * @module models/id
 * @description Helpers for generating stable client-side model identifiers.
 */

const FALLBACK_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const randomChars = (length = 12) => {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    const i = Math.floor(Math.random() * FALLBACK_ALPHABET.length);
    value += FALLBACK_ALPHABET[i];
  }
  return value;
};

/**
 * Generate a stable model id.
 *
 * @param {string} [prefix="id"]
 * @returns {string}
 */
export const generateModelId = (prefix = "id") => {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${randomChars(8)}`;
};

