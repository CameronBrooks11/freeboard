/**
 * @module config
 * @description Environment and default configuration values for Freeboard API.
 */

import { createRequire } from "module";

/** Create CommonJS `require` in ES module context */
const require = createRequire(import.meta.url);

// Load environment variables from .env file into process.env
require("dotenv").config();

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
  jwtSecret: process.env.JWT_SECRET || "freeboard",
  jwtTimeExpiration: process.env.JWT_TIME_EXPIRATION || "2h",
  userLimit: num(process.env.USER_LIMIT, 0),
  adminEmail: process.env.ADMIN_EMAIL || "admin@freeboard",
  adminPassword: process.env.ADMIN_PASSWORD || "freeboard",
  createAdmin: process.env.CREATE_ADMIN === "false" ? false : true, // default true unless explicitly "false"
});
