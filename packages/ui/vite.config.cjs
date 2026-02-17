/**
 * @module vite.config
 * @description Vite configuration for Freeboard UI, handling build and development settings.
 *  - Enables Vue 3 single-file components
 *  - Supports IPv4-first DNS resolution to avoid IPv6 (::1) issues
 *  - Configures base paths for static vs dynamic deployment
 *  - Proxies API and gateway service calls in development
 */

const path = require("path");
const { defineConfig, loadEnv } = require("vite");
const vue = require("@vitejs/plugin-vue");
const dns = require("dns");

dns.setDefaultResultOrder?.("ipv4first");

module.exports = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const API_HOST = env.FREEBOARD_API_HOST || "127.0.0.1";
  const API_PORT = Number(env.FREEBOARD_API_PORT || 4001);
  const GATEWAY_HOST = env.FREEBOARD_GATEWAY_HOST || "127.0.0.1";
  const GATEWAY_PORT = Number(env.FREEBOARD_GATEWAY_PORT || 8001);

  const isStatic = ["1", "true", "yes", "on"].includes(
    String(env.FREEBOARD_STATIC || "")
      .trim()
      .toLowerCase(),
  );

  const STATIC_BASE = env.FREEBOARD_BASE_PATH || (isStatic ? "/freeboard/" : "/");

  return {
    plugins: [vue()],
    base: STATIC_BASE,
    resolve: {
      alias: {
        "~": path.resolve(__dirname, env.FREEBOARD_NODE_MODULES || "./../../node_modules"),
      },
    },
    define: {
      __FREEBOARD_VERSION__: JSON.stringify(process.env.npm_package_version),
      __FREEBOARD_STATIC__: isStatic ? "true" : "false",
      __FREEBOARD_BASE_PATH__: JSON.stringify(STATIC_BASE),
    },
    server: {
      host: true,
      strictPort: false,
      proxy: {
        "/graphql": {
          target: `http://${API_HOST}:${API_PORT}`,
          changeOrigin: true,
        },
        "/gateway": {
          target: `http://${GATEWAY_HOST}:${GATEWAY_PORT}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 7000,
    },
  };
});
