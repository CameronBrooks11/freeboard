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
  isNonDevRuntimeEnv,
  isWeakCredentialEncryptionKey,
  isWeakSharedSecret,
  parseBase64Key,
} from "@freeboard/shared/runtimePolicy.js";
import {
  EMAIL_POLICY_MESSAGE,
  PASSWORD_POLICY_MESSAGE,
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

const boundedInteger = (
  v: unknown,
  fallback: number,
  {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
  }: { min?: number; max?: number } = {},
): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  const normalized = Math.floor(n);
  if (normalized < min || normalized > max) {
    return fallback;
  }
  return normalized;
};

type DataBackend = "postgres";
type SecurityLimiterBackend = "memory" | "postgres";

const normalizeDataBackend = (value: unknown): DataBackend | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "postgres") {
    return "postgres";
  }
  return null;
};

const resolvePostgresUrl = (): string | null => {
  const directUrl = String(process.env.DATABASE_URL || "").trim();
  if (directUrl) {
    return directUrl;
  }
  const freeboardUrl = String(process.env.FREEBOARD_POSTGRES_URL || "").trim();
  if (freeboardUrl) {
    return freeboardUrl;
  }
  return null;
};

const normalizeSecurityLimiterBackend = (
  value: unknown,
  fallback: SecurityLimiterBackend | null,
): SecurityLimiterBackend | null => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "memory" || normalized === "postgres") {
    return normalized;
  }
  return fallback;
};

const normalizeLimiterFailureMode = (
  value: unknown,
  fallback: "fail-open" | "fail-closed",
): "fail-open" | "fail-closed" => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "fail-open" || normalized === "fail-closed") {
    return normalized;
  }
  return fallback;
};

const normalizeLimiterNamespace = (value: unknown, fallback: string): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 96);
};

const environment = String(process.env.NODE_ENV || "development").toLowerCase();
const isNonDevRuntime = isNonDevRuntimeEnv(environment);
const explicitBackendRaw = String(process.env.DB_BACKEND || "")
  .trim()
  .toLowerCase();
const explicitBackend = explicitBackendRaw ? normalizeDataBackend(explicitBackendRaw) : null;
if (explicitBackendRaw && !explicitBackend) {
  throw new Error("DB_BACKEND must be one of: postgres.");
}
const postgresUrl = resolvePostgresUrl();
const hasExplicitPostgresUrl = Boolean(postgresUrl);
const dbBackend: DataBackend = "postgres";
const explicitLimiterBackendRaw = String(process.env.SECURITY_LIMITER_BACKEND || "")
  .trim()
  .toLowerCase();
const explicitLimiterBackend = explicitLimiterBackendRaw
  ? normalizeSecurityLimiterBackend(explicitLimiterBackendRaw, null)
  : null;
if (explicitLimiterBackendRaw && !explicitLimiterBackend) {
  throw new Error("SECURITY_LIMITER_BACKEND must be one of: memory, postgres.");
}

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
 * @property {"postgres"} dbBackend - Selected data backend.
 * @property {string|null} postgresUrl  - PostgreSQL connection URL when configured.
 * @property {number} postgresConnectTimeoutMs - PostgreSQL connection timeout.
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
 * @property {number} apiTrustProxyHops - Trusted proxy hops for deriving client IP from X-Forwarded-For.
 * @property {"memory"|"postgres"} securityLimiterBackend - Backing store for security limiter state.
 * @property {"fail-open"|"fail-closed"} securityLimiterFailureMode - Behavior when limiter backend is unavailable.
 * @property {string} securityLimiterNamespace - Prefix namespace for limiter keys.
 * @property {string} securityLimiterHashSalt - HMAC salt for hashing untrusted key material.
 * @property {number} securityLimiterMemoryMaxKeys - Max in-memory limiter keys in local fallback mode.
 */

/**
 * Application configuration, loaded from environment variables or defaults.
 *
 * @type {Config}
 */
export const config = Object.freeze({
  host: process.env.API_HOST || "0.0.0.0", // Bind on all interfaces by default
  port: num(process.env.PORT, 4001), // Port with sensible fallback
  dbBackend,
  postgresUrl,
  postgresConnectTimeoutMs: positiveInteger(process.env.POSTGRES_CONNECT_TIMEOUT_MS, 30000),
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
  apiTrustProxyHops: Math.max(
    0,
    boundedInteger(process.env.API_TRUST_PROXY_HOPS, 0, { min: 0, max: 16 }),
  ),
  securityLimiterBackend: explicitLimiterBackend || (isNonDevRuntime ? dbBackend : "memory"),
  securityLimiterFailureMode: normalizeLimiterFailureMode(
    process.env.SECURITY_LIMITER_FAILURE_MODE,
    isNonDevRuntime ? "fail-closed" : "fail-open",
  ),
  securityLimiterNamespace: normalizeLimiterNamespace(
    process.env.SECURITY_LIMITER_NAMESPACE,
    "freeboard:security-limiter",
  ),
  securityLimiterHashSalt: String(
    process.env.SECURITY_LIMITER_HASH_SALT || process.env.JWT_SECRET || "freeboard-local-limiter",
  )
    .trim()
    .slice(0, 512),
  securityLimiterMemoryMaxKeys: positiveInteger(
    process.env.SECURITY_LIMITER_MEMORY_MAX_KEYS,
    10000,
  ),
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

if (isNonDevRuntime && isWeakSharedSecret(config.jwtSecret)) {
  throw new Error(
    "JWT_SECRET is missing or too weak for non-development runtime. Provide a strong secret (>=32 chars).",
  );
}

if (config.dbBackend === "postgres" && !config.postgresUrl) {
  throw new Error("DATABASE_URL or FREEBOARD_POSTGRES_URL is required for Postgres runtime.");
}

if (isNonDevRuntime && config.dbBackend === "postgres" && !hasExplicitPostgresUrl) {
  throw new Error(
    "DATABASE_URL or FREEBOARD_POSTGRES_URL must be explicitly configured for non-development runtime.",
  );
}

if (isNonDevRuntime && isWeakSharedSecret(config.jwtGatewaySecret)) {
  throw new Error(
    "JWT_GATEWAY_SECRET is missing or too weak for non-development runtime. Provide a strong secret (>=32 chars).",
  );
}

if (isNonDevRuntime && isWeakSharedSecret(config.gatewayServiceToken)) {
  throw new Error(
    "GATEWAY_SERVICE_TOKEN is missing or too weak for non-development runtime. Provide a strong token (>=32 chars).",
  );
}

if (isNonDevRuntime && isWeakCredentialEncryptionKey(process.env.CREDENTIAL_ENCRYPTION_KEY)) {
  throw new Error(
    "CREDENTIAL_ENCRYPTION_KEY is missing, invalid, or weak for non-development runtime. Provide a strong base64-encoded 32-byte key.",
  );
}

if (isNonDevRuntime && config.securityLimiterBackend === "memory") {
  throw new Error(
    "SECURITY_LIMITER_BACKEND must not be set to 'memory' in non-development runtime.",
  );
}

if (
  config.securityLimiterBackend !== "memory" &&
  config.securityLimiterBackend !== config.dbBackend
) {
  throw new Error(
    `SECURITY_LIMITER_BACKEND='${config.securityLimiterBackend}' is incompatible with DB_BACKEND='${config.dbBackend}'.`,
  );
}

if (config.createAdmin) {
  if (!isValidEmail(config.adminEmail)) {
    warnAndThrow(`CREATE_ADMIN=true requires valid ADMIN_EMAIL. ${EMAIL_POLICY_MESSAGE}.`);
  }

  if (!isStrongPassword(config.adminPassword)) {
    warnAndThrow(`CREATE_ADMIN=true requires strong ADMIN_PASSWORD. ${PASSWORD_POLICY_MESSAGE}.`);
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
