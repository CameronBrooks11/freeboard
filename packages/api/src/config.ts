/**
 * @module config
 * Environment and default configuration values for Freeboard API.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  getCredentialPolicyHints,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "./validators.js";
import {
  normalizeDashboardVisibility,
  normalizeExecutionMode,
  normalizeNonAdminRole,
  normalizeRegistrationMode,
} from "./policy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiPackageDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(__dirname, "../../..");

const loadEnvFile = (
  filePath: string,
  { overridableKeys = new Set<string>() }: { overridableKeys?: Set<string> } = {},
): Set<string> => {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }

  const parsed = dotenv.parse(fs.readFileSync(filePath));
  const loadedKeys = new Set<string>();
  for (const [key, value] of Object.entries(parsed)) {
    const hasExternalValue = Object.prototype.hasOwnProperty.call(process.env, key);
    if (!hasExternalValue || overridableKeys.has(key)) {
      process.env[key] = value;
      loadedKeys.add(key);
    }
  }

  return loadedKeys;
};

// Deterministic env precedence:
// 1) existing process env (shell/CI)
// 2) packages/api/.env (optional local override)
// 3) repo-root .env
const rootEnvLoadedKeys = loadEnvFile(path.join(repoRootDir, ".env"));
loadEnvFile(path.join(apiPackageDir, ".env"), {
  overridableKeys: rootEnvLoadedKeys,
});

/**
 * Convert a value to a finite number, or return a fallback if the conversion fails.
 *
 * @param {string|number|undefined|null} v - The value to convert to a number.
 * @param {number} fallback - The fallback number to use if `v` is not a finite number.
 * @returns {number} The converted number if finite, otherwise the `fallback` value.
 */
const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v: unknown, fallback = false): boolean => {
  if (v === undefined || v === null || v === "") {
    return fallback;
  }

  if (typeof v === "boolean") {
    return v;
  }

  const normalized = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const positiveInteger = (v: unknown, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  const normalized = Math.floor(n);
  if (normalized < 1) {
    return fallback;
  }
  return normalized;
};

const decodeBase64 = (value: unknown): Buffer | null => {
  try {
    return Buffer.from(String(value || ""), "base64");
  } catch {
    return null;
  }
};

const parseBase64Key = (value: unknown, expectedLength: number): Buffer | null => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const decoded = decodeBase64(value.trim());
  if (!decoded || decoded.length !== expectedLength) {
    return null;
  }
  return decoded;
};

const environment = String(process.env.NODE_ENV || "development").toLowerCase();
const isNonDevRuntime = !["development", "test"].includes(environment);
const hasExplicitMongoUrl =
  typeof process.env.MONGO_URL === "string" && process.env.MONGO_URL.trim() !== "";

const isWeakJwtSecret = (secret: unknown): boolean => {
  if (!secret || typeof secret !== "string") {
    return true;
  }

  const normalized = secret.trim().toLowerCase();
  if (secret.length < 32) {
    return true;
  }

  if (
    normalized.includes("replace-with") ||
    normalized.includes("example") ||
    normalized.includes("local-only")
  ) {
    return true;
  }

  return ["freeboard", "changeme", "default", "secret", "password"].includes(normalized);
};

const credentialPolicy = getCredentialPolicyHints();

const warnAndThrow = (message: string): never => {
  console.warn(`Configuration warning: ${message}`);
  throw new Error(message);
};

const resolveUnknownErrorMessage = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "message" in error
    ? String((error as { message?: string }).message || fallback)
    : fallback;

const gatewaySecretDefault = "freeboard-gateway-dev-insecure-local-only-secret-32";
const gatewayServiceTokenDefault = "freeboard-gateway-service-dev-token-local-only-32";
const credentialEncryptionKeyFromEnv = parseBase64Key(process.env.CREDENTIAL_ENCRYPTION_KEY, 32);
const credentialEncryptionKey =
  credentialEncryptionKeyFromEnv ||
  (isNonDevRuntime
    ? null
    : (() => {
        const generated = crypto.randomBytes(32);
        console.warn(
          "Configuration warning: CREDENTIAL_ENCRYPTION_KEY is missing/invalid in development. Generated ephemeral key; encrypted credentials will be unreadable after restart.",
        );
        return generated;
      })());

/**
 * @typedef {Object} Config
 * @property {string} host              - Hostname for the API server.
 * @property {number} port              - Port the API server listens on.
 * @property {string} mongoUrl          - MongoDB connection URL.
 * @property {string} jwtSecret         - Secret key for signing JWTs.
 * @property {string} jwtTimeExpiration - Expiration duration for JWT tokens.
 * @property {number} userLimit         - Maximum number of users allowed (0 = unlimited).
 * @property {string} adminEmail        - Default administrator email.
 * @property {string} adminPassword     - Default administrator password.
 * @property {boolean} createAdmin      - Whether to create an admin user on startup.
 * @property {string} registrationMode  - Registration mode (`disabled|invite|open`).
 * @property {string} registrationDefaultRole - Default role for self-registration (`viewer|editor`).
 * @property {boolean} editorCanPublish - Whether editors can publish dashboards.
 * @property {string} dashboardDefaultVisibility - Default dashboard visibility (`private|link|public`).
 * @property {boolean} dashboardPublicListingEnabled - Whether public dashboards can appear in listings.
 * @property {string} executionMode   - Runtime execution mode (`safe|trusted`).
 * @property {boolean} policyEditLock   - Whether runtime policy mutations are blocked.
 * @property {number} authLoginMaxAttempts - Failed login attempts before lockout.
 * @property {number} authLoginWindowSeconds - Rolling window for failed login attempts.
 * @property {number} authLoginLockSeconds - Temporary lockout duration after threshold is reached.
 */

/**
 * Application configuration, loaded from environment variables or defaults.
 *
 * @type {Config}
 */
export const config = Object.freeze({
  host: process.env.API_HOST || "0.0.0.0", // Bind on all interfaces by default
  port: num(process.env.PORT, 4001), // Port with sensible fallback
  mongoUrl: process.env.MONGO_URL || "mongodb://127.0.0.1:27017/freeboard", // Local-only default for development/test
  jwtSecret: process.env.JWT_SECRET || "freeboard-dev-insecure-local-only",
  jwtTimeExpiration: process.env.JWT_TIME_EXPIRATION || "2h",
  userLimit: num(process.env.USER_LIMIT, 0),
  adminEmail: normalizeEmail(process.env.ADMIN_EMAIL || ""),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  createAdmin: bool(process.env.CREATE_ADMIN, false),
  registrationMode: String(process.env.AUTH_REGISTRATION_MODE || "disabled")
    .trim()
    .toLowerCase(),
  registrationDefaultRole: String(process.env.AUTH_REGISTRATION_DEFAULT_ROLE || "viewer")
    .trim()
    .toLowerCase(),
  editorCanPublish: bool(process.env.AUTH_EDITOR_CAN_PUBLISH, false),
  dashboardDefaultVisibility: String(process.env.DASHBOARD_DEFAULT_VISIBILITY || "private")
    .trim()
    .toLowerCase(),
  dashboardPublicListingEnabled: bool(process.env.DASHBOARD_PUBLIC_LISTING_ENABLED, false),
  executionMode: String(process.env.EXECUTION_MODE || "safe")
    .trim()
    .toLowerCase(),
  policyEditLock: bool(process.env.POLICY_EDIT_LOCK, false),
  authLoginMaxAttempts: positiveInteger(process.env.AUTH_LOGIN_MAX_ATTEMPTS, 5),
  authLoginWindowSeconds: positiveInteger(process.env.AUTH_LOGIN_WINDOW_SECONDS, 300),
  authLoginLockSeconds: positiveInteger(process.env.AUTH_LOGIN_LOCK_SECONDS, 300),
  jwtGatewaySecret: process.env.JWT_GATEWAY_SECRET || gatewaySecretDefault,
  gatewayServiceToken: process.env.GATEWAY_SERVICE_TOKEN || gatewayServiceTokenDefault,
  credentialEncryptionKey,
  fetchTimeoutMs: positiveInteger(process.env.FETCH_TIMEOUT_MS, 15000),
  fetchMaxResponseBytes: positiveInteger(process.env.FETCH_MAX_RESPONSE_BYTES, 5 * 1024 * 1024),
  datasourceTokenMintRateLimitUserPerMin: positiveInteger(
    process.env.DATASOURCE_TOKEN_MINT_RATE_LIMIT_USER_PER_MIN,
    60,
  ),
  datasourceTokenMintRateLimitPublicIpPerMin: positiveInteger(
    process.env.DATASOURCE_TOKEN_MINT_RATE_LIMIT_PUBLIC_IP_PER_MIN,
    30,
  ),
  datasourceTokenMintRateLimitShareTokenPerMin: positiveInteger(
    process.env.DATASOURCE_TOKEN_MINT_RATE_LIMIT_SHARE_TOKEN_PER_MIN,
    60,
  ),
  datasourceSessionTtlSeconds: positiveInteger(process.env.DATASOURCE_SESSION_TTL_SECONDS, 300),
  gatewayIntrospectionRateLimitPerMin: positiveInteger(
    process.env.GATEWAY_INTROSPECTION_RATE_LIMIT_PER_MIN,
    600,
  ),
  gatewayRevokedTokensRateLimitPerMin: positiveInteger(
    process.env.GATEWAY_REVOKED_TOKENS_RATE_LIMIT_PER_MIN,
    600,
  ),
  gatewayRevokedTokensMaxBatch: positiveInteger(process.env.GATEWAY_REVOKED_TOKENS_MAX_BATCH, 500),
  realtimeRevokeEventRetentionSeconds: positiveInteger(
    process.env.REALTIME_REVOKE_EVENT_RETENTION_SECONDS,
    86_400,
  ),
});

if (isNonDevRuntime && isWeakJwtSecret(config.jwtSecret)) {
  throw new Error(
    "JWT_SECRET is missing or too weak for non-development runtime. Provide a strong secret (>=32 chars).",
  );
}

if (isNonDevRuntime && !hasExplicitMongoUrl) {
  throw new Error("MONGO_URL must be explicitly configured for non-development runtime.");
}

if (isNonDevRuntime && isWeakJwtSecret(config.jwtGatewaySecret)) {
  throw new Error(
    "JWT_GATEWAY_SECRET is missing or too weak for non-development runtime. Provide a strong secret (>=32 chars).",
  );
}

if (isNonDevRuntime && isWeakJwtSecret(config.gatewayServiceToken)) {
  throw new Error(
    "GATEWAY_SERVICE_TOKEN is missing or too weak for non-development runtime. Provide a strong token (>=32 chars).",
  );
}

if (isNonDevRuntime && !credentialEncryptionKey) {
  throw new Error(
    "CREDENTIAL_ENCRYPTION_KEY must be set to a valid base64-encoded 32-byte key in non-development runtime.",
  );
}

if (config.createAdmin) {
  if (!isValidEmail(config.adminEmail)) {
    warnAndThrow(`CREATE_ADMIN=true requires valid ADMIN_EMAIL. ${credentialPolicy.email}.`);
  }

  if (!isStrongPassword(config.adminPassword)) {
    warnAndThrow(`CREATE_ADMIN=true requires strong ADMIN_PASSWORD. ${credentialPolicy.password}.`);
  }
}

try {
  normalizeRegistrationMode(config.registrationMode);
} catch (error) {
  warnAndThrow(resolveUnknownErrorMessage(error, "Invalid registration mode"));
}

try {
  normalizeNonAdminRole(config.registrationDefaultRole);
} catch (error) {
  warnAndThrow(resolveUnknownErrorMessage(error, "Invalid registration default role"));
}

try {
  normalizeDashboardVisibility(config.dashboardDefaultVisibility);
} catch (error) {
  warnAndThrow(resolveUnknownErrorMessage(error, "Invalid dashboard default visibility"));
}

try {
  normalizeExecutionMode(config.executionMode);
} catch (error) {
  warnAndThrow(resolveUnknownErrorMessage(error, "Invalid execution mode"));
}

if (config.authLoginMaxAttempts < 1) {
  warnAndThrow("AUTH_LOGIN_MAX_ATTEMPTS must be >= 1");
}
if (config.authLoginWindowSeconds < 1) {
  warnAndThrow("AUTH_LOGIN_WINDOW_SECONDS must be >= 1");
}
if (config.authLoginLockSeconds < 1) {
  warnAndThrow("AUTH_LOGIN_LOCK_SECONDS must be >= 1");
}
