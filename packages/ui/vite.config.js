/**
 * @module vite.config
 * @description Vite configuration for Freeboard UI, handling build and development settings.
 *  - Enables Vue 3 single-file components
 *  - Supports IPv4-first DNS resolution to avoid IPv6 (::1) issues
 *  - Configures base paths for static vs dynamic deployment
 *  - Proxies API and Proxy service calls in development
 */

import * as path from "path";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import dns from "dns";

/**
 * Force DNS resolution to prefer IPv4 to avoid IPv6 (::1) binding issues.
 */
dns.setDefaultResultOrder?.("ipv4first");

export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode (development, production, etc.)
  const env = loadEnv(mode, process.cwd(), "");

  /**
   * API host and port for development proxy.
   * @constant {string}
   * @default "127.0.0.1"
   */
  const API_HOST = env.FREEBOARD_API_HOST || "127.0.0.1";

  /**
   * API port for development proxy.
   * @constant {number}
   * @default 4001
   */
  const API_PORT = Number(env.FREEBOARD_API_PORT || 4001);

  /**
   * Proxy service host for development proxy.
   * @constant {string}
   * @default "127.0.0.1"
   */
  const PROXY_HOST = env.FREEBOARD_PROXY_HOST || "127.0.0.1";

  /**
   * Proxy service port for development proxy.
   * @constant {number}
   * @default 8001
   */
  const PROXY_PORT = Number(env.FREEBOARD_PROXY_PORT || 8001);

  /**
   * Parse FREEBOARD_STATIC as a strict boolean.
   * Accepts: 1, true, yes, on (case-insensitive).
   */
  const isStatic = ["1", "true", "yes", "on"].includes(
    String(env.FREEBOARD_STATIC || "")
      .trim()
      .toLowerCase()
  );

  /**
   * Public base path for built assets.
   * Allows overriding the default with FREEBOARD_BASE_PATH (e.g., /freeboard/demo/).
   */
  const STATIC_BASE =
    env.FREEBOARD_BASE_PATH ||
    (isStatic ? "/freeboard/" : "/");

  return {
    // Enable Vue 3 single-file component support
    plugins: [vue()],

    // Base public path; configurable via FREEBOARD_BASE_PATH, falls back to /freeboard/ in static mode
    base: STATIC_BASE,

    resolve: {
      alias: {
        // Alias '~' to custom node_modules path for shared dependencies
        "~": path.resolve(
          __dirname,
          env.FREEBOARD_NODE_MODULES || "./../../node_modules"
        ),
      },
    },

    define: {
      // Inject package version and static flags into the client
      __FREEBOARD_VERSION__: JSON.stringify(process.env.npm_package_version),
      __FREEBOARD_STATIC__: isStatic ? "true" : "false",
      __FREEBOARD_BASE_PATH__: JSON.stringify(STATIC_BASE),
    },

    server: {
      // Allow binding to all interfaces for LAN/RPi access
      host: true,

      // Allow using the next available port if the default is taken
      strictPort: false,

      // Development proxy rules for API and proxy endpoints
      proxy: {
        "/graphql": {
          target: `http://${API_HOST}:${API_PORT}`,
          changeOrigin: true,
        },
        "/proxy": {
          target: `http://${PROXY_HOST}:${PROXY_PORT}`,
          changeOrigin: true,
        },
      },
    },
  };
});
