/**
 * @module tokenSecurity
 * @description Helpers for generating and hashing one-time action tokens.
 */

import crypto from "node:crypto";
import { config } from "./config.js";

/**
 * Generate a high-entropy URL-safe token for invite/reset flows.
 *
 * @returns {string}
 */
export const generateOneTimeToken = () => crypto.randomBytes(32).toString("base64url");

/**
 * Hash token with app secret as pepper before persistence.
 *
 * @param {string} token
 * @returns {string}
 */
export const hashOneTimeToken = (token) =>
  crypto
    .createHash("sha256")
    .update(`${String(token || "")}:${config.jwtSecret}`)
    .digest("hex");
