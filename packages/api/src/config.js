/**
 * @module config
 * @description Environment and default configuration values for Freeboard API.
 */

import fs from "node:fs";
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

const loadEnvFile = (filePath, { overridableKeys = new Set() } = {}) => {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }

  const parsed = dotenv.parse(fs.readFileSync(filePath));
  const loadedKeys = new Set();
  for (const [key, value] of Object.entries(parsed)) {
    const hasExternalValue = Object.prototype.hasOwnProperty.call(
      process.env,
      key
    );
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
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v, fallback = false) => {
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

const environment = String(process.env.NODE_ENV || "development").toLowerCase();
const isNonDevRuntime = !["development", "test"].includes(environment);

const isWeakJwtSecret = (secret) => {
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

  return ["freeboard", "changeme", "default", "secret", "password"].includes(
    normalized
  );
};

const credentialPolicy = getCredentialPolicyHints();

const warnAndThrow = (message) => {
  console.warn(`Configuration warning: ${message}`);
  throw new Error(message);
};

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
 */

/**
 * Application configuration, loaded from environment variables or defaults.
 *
 * @type {Config}
 */
export const config = Object.freeze({
  host: process.env.API_HOST || "0.0.0.0", // Bind on all interfaces by default
  port: num(process.env.PORT, 4001), // Port with sensible fallback
  mongoUrl:
    process.env.MONGO_URL ||
    "mongodb://freeboard:unsecure@127.0.0.1:27017/freeboard", // Prefer IPv4 literal and include a DB name to be explicit
  jwtSecret: process.env.JWT_SECRET || "freeboard-dev-insecure-local-only",
  jwtTimeExpiration: process.env.JWT_TIME_EXPIRATION || "2h",
  userLimit: num(process.env.USER_LIMIT, 0),
  adminEmail: normalizeEmail(process.env.ADMIN_EMAIL || ""),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  createAdmin: bool(process.env.CREATE_ADMIN, false),
  registrationMode: String(process.env.AUTH_REGISTRATION_MODE || "disabled")
    .trim()
    .toLowerCase(),
  registrationDefaultRole: String(
    process.env.AUTH_REGISTRATION_DEFAULT_ROLE || "viewer"
  )
    .trim()
    .toLowerCase(),
  editorCanPublish: bool(process.env.AUTH_EDITOR_CAN_PUBLISH, false),
  dashboardDefaultVisibility: String(
    process.env.DASHBOARD_DEFAULT_VISIBILITY || "private"
  )
    .trim()
    .toLowerCase(),
  dashboardPublicListingEnabled: bool(
    process.env.DASHBOARD_PUBLIC_LISTING_ENABLED,
    false
  ),
  executionMode: String(process.env.EXECUTION_MODE || "safe")
    .trim()
    .toLowerCase(),
  policyEditLock: bool(process.env.POLICY_EDIT_LOCK, false),
});

if (isNonDevRuntime && isWeakJwtSecret(config.jwtSecret)) {
  throw new Error(
    "JWT_SECRET is missing or too weak for non-development runtime. Provide a strong secret (>=32 chars)."
  );
}

if (config.createAdmin) {
  if (!isValidEmail(config.adminEmail)) {
    warnAndThrow(
      `CREATE_ADMIN=true requires valid ADMIN_EMAIL. ${credentialPolicy.email}.`
    );
  }

  if (!isStrongPassword(config.adminPassword)) {
    warnAndThrow(
      `CREATE_ADMIN=true requires strong ADMIN_PASSWORD. ${credentialPolicy.password}.`
    );
  }
}

try {
  normalizeRegistrationMode(config.registrationMode);
} catch (error) {
  warnAndThrow(error.message);
}

try {
  normalizeNonAdminRole(config.registrationDefaultRole);
} catch (error) {
  warnAndThrow(error.message);
}

try {
  normalizeDashboardVisibility(config.dashboardDefaultVisibility);
} catch (error) {
  warnAndThrow(error.message);
}

try {
  normalizeExecutionMode(config.executionMode);
} catch (error) {
  warnAndThrow(error.message);
}
