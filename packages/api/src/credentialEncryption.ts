/**
 * @module credentialEncryption
 * AES-256-GCM helpers for credential profile secret payloads.
 */

import crypto from "node:crypto";
import { config } from "./config.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_ID = "v1";

export type EncryptedSecretPayload = {
  algorithm: string;
  keyId: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

const decodeBase64 = (value: unknown): Buffer => Buffer.from(String(value || ""), "base64");
const encodeBase64 = (value: Buffer): string => Buffer.from(value).toString("base64");
const getEncryptionKey = (): Buffer => {
  if (!config.credentialEncryptionKey) {
    throw new Error("Credential encryption key is not configured");
  }
  return config.credentialEncryptionKey;
};

/**
 * Encrypt credential secret payload for storage.
 *
 * @param {Object} secret
 * @returns {{algorithm: string, keyId: string, iv: string, ciphertext: string, authTag: string}}
 */
export const encryptCredentialSecret = (
  secret: Record<string, unknown> = {},
): EncryptedSecretPayload => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(secret || {}), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: ALGORITHM,
    keyId: KEY_ID,
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(ciphertext),
    authTag: encodeBase64(authTag),
  };
};

/**
 * Decrypt credential secret payload from storage.
 *
 * @param {Object|null|undefined} encrypted
 * @returns {Object}
 */
export const decryptCredentialSecret = (
  encrypted: EncryptedSecretPayload | null | undefined,
): Record<string, unknown> => {
  if (!encrypted || typeof encrypted !== "object") {
    return {};
  }

  if (
    encrypted.algorithm !== ALGORITHM ||
    typeof encrypted.iv !== "string" ||
    typeof encrypted.ciphertext !== "string" ||
    typeof encrypted.authTag !== "string"
  ) {
    throw new Error("Credential secret payload is invalid");
  }

  const iv = decodeBase64(encrypted.iv);
  const ciphertext = decodeBase64(encrypted.ciphertext);
  const authTag = decodeBase64(encrypted.authTag);

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  return JSON.parse(plaintext);
};

/**
 * Build redacted secret metadata for API responses.
 *
 * @param {Object|null|undefined} secret
 * @returns {Object}
 */
export const redactSecretShape = (
  secret: Record<string, unknown> | null | undefined,
): Record<string, string> => {
  if (!secret || typeof secret !== "object") {
    return {};
  }

  return Object.fromEntries(Object.keys(secret).map((key) => [key, "***"]));
};
