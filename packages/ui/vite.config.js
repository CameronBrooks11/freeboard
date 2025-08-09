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
   * Whether running in static deployment mode.
   * Used to determine the base public path.
   */
  const isStatic = JSON.stringify(process.env.FREEBOARD_STATIC);

  return {
    // Enable Vue 3 single-file component support
    plugins: [vue()],

    // Base public path; use '/freeboard/' when static flag is set
    base: isStatic ? "/freeboard/" : "/",

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
      // Inject package version and static flag into the client
      __FREEBOARD_VERSION__: JSON.stringify(process.env.npm_package_version),
      __FREEBOARD_STATIC__: isStatic,
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
