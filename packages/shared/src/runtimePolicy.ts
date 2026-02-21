/**
 * @module shared/runtimePolicy
 * Shared runtime-mode and secret-quality policy helpers.
 */

const DEVELOPMENT_ENVIRONMENTS = new Set(["development", "test"]);

const WEAK_SECRET_EXACT_VALUES = new Set([
  "freeboard",
  "changeme",
  "default",
  "secret",
  "password",
]);

const WEAK_SECRET_SUBSTRINGS = ["replace-with", "example", "local-only"];

const WEAK_SECRET_PATTERNS = [
  /^freeboard-local-dev-/i,
  /^freeboard-dev-insecure-local-only/i,
  /^freeboard-gateway-dev-insecure-local-only/i,
  /^freeboard-gateway-service-dev-token-local-only/i,
];

const DETERMINISTIC_TEMPLATE_CREDENTIAL_KEYS = new Set([
  "mdeymzq1njc4owfiy2rlzjaxmjm0nty3odlhymnkzwy=",
]);

const normalizeString = (value: unknown): string => String(value || "").trim();

const estimateShannonEntropyBits = (value: string): number => {
  if (!value) {
    return 0;
  }

  const frequencies = new Map<string, number>();
  for (const char of value) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  let bitsPerChar = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    bitsPerChar -= probability * Math.log2(probability);
  }
  return bitsPerChar * value.length;
};

const estimateBufferEntropyBits = (value: Buffer): number => {
  if (value.length === 0) {
    return 0;
  }

  const frequencies = new Map<number, number>();
  for (const byte of value.values()) {
    frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
  }

  let bitsPerByte = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    bitsPerByte -= probability * Math.log2(probability);
  }
  return bitsPerByte * value.length;
};

export const normalizeRuntimeEnv = (value: unknown): string =>
  normalizeString(value).toLowerCase() || "development";

export const isNonDevRuntimeEnv = (value: unknown): boolean =>
  !DEVELOPMENT_ENVIRONMENTS.has(normalizeRuntimeEnv(value));

type SharedSecretPolicyOptions = {
  minLength?: number;
  minEntropyBits?: number;
};

/**
 * Returns true when a shared secret/token value is considered weak.
 * This helper is intentionally strict for non-development runtime validation.
 */
export const isWeakSharedSecret = (
  value: unknown,
  { minLength = 32, minEntropyBits = 72 }: SharedSecretPolicyOptions = {},
): boolean => {
  if (typeof value !== "string") {
    return true;
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (trimmed.length < minLength) {
    return true;
  }

  if (WEAK_SECRET_EXACT_VALUES.has(normalized)) {
    return true;
  }

  if (WEAK_SECRET_SUBSTRINGS.some((entry) => normalized.includes(entry))) {
    return true;
  }

  if (WEAK_SECRET_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  if (new Set(trimmed).size < 6) {
    return true;
  }

  if (estimateShannonEntropyBits(trimmed) < minEntropyBits) {
    return true;
  }

  return false;
};

export const parseBase64Key = (value: unknown, expectedLength: number): Buffer | null => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const decoded = Buffer.from(value.trim(), "base64");
    if (decoded.length !== expectedLength) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

type CredentialKeyPolicyOptions = {
  minEntropyBits?: number;
};

/**
 * Returns true when credential-encryption key material is weak for non-dev runtime.
 * Expects base64-encoded 32-byte key format used by API credential encryption.
 */
export const isWeakCredentialEncryptionKey = (
  value: unknown,
  { minEntropyBits = 120 }: CredentialKeyPolicyOptions = {},
): boolean => {
  if (typeof value !== "string" || value.trim() === "") {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (DETERMINISTIC_TEMPLATE_CREDENTIAL_KEYS.has(normalized)) {
    return true;
  }

  const decoded = parseBase64Key(value, 32);
  if (!decoded) {
    return true;
  }

  const uniqueByteCount = new Set(decoded.values()).size;
  if (uniqueByteCount < 8) {
    return true;
  }

  if (decoded.subarray(0, 16).equals(decoded.subarray(16))) {
    return true;
  }

  if (estimateBufferEntropyBits(decoded) < minEntropyBits) {
    return true;
  }

  return false;
};
