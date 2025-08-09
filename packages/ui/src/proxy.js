/**
 * @module proxy
 * @description Utility to construct a proxied URL string for CORS bypass.
 */

/**
 * Build a CORS-bypass proxy URL for a given target.
 *
 * @param {string} url - The target URL to proxy.
 * @returns {string} Proxy endpoint with the encoded target URL.
 */
export default (url) =>
  "/proxy/?" + new URLSearchParams([["url", url]]).toString();
