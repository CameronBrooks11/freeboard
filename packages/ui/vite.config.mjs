/**
 * @module vite.config
 * @description Vite configuration for Freeboard UI, handling build and development settings.
 *  - Enables Vue 3 single-file components
 *  - Supports IPv4-first DNS resolution to avoid IPv6 (::1) issues
 *  - Configures base paths for static vs dynamic deployment
 *  - Proxies API and gateway service calls in development
 */

import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dns.setDefaultResultOrder?.("ipv4first");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const API_HOST = process.env.FREEBOARD_API_HOST || env.FREEBOARD_API_HOST || "127.0.0.1";
  const API_PORT = Number(process.env.FREEBOARD_API_PORT || env.FREEBOARD_API_PORT || 4001);
  const GATEWAY_HOST =
    process.env.FREEBOARD_GATEWAY_HOST || env.FREEBOARD_GATEWAY_HOST || "127.0.0.1";
  const GATEWAY_PORT = Number(
    process.env.FREEBOARD_GATEWAY_PORT || env.FREEBOARD_GATEWAY_PORT || 8001,
  );

  const isStatic = ["1", "true", "yes", "on"].includes(
    String(process.env.FREEBOARD_STATIC || env.FREEBOARD_STATIC || "")
      .trim()
      .toLowerCase(),
  );

  const STATIC_BASE =
    process.env.FREEBOARD_BASE_PATH || env.FREEBOARD_BASE_PATH || (isStatic ? "/freeboard/" : "/");

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
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");
            if (!normalizedId.includes("/node_modules/")) {
              return;
            }
            if (
              normalizedId.includes("/monaco-editor/") ||
              normalizedId.includes("/@guolao/vue-monaco-editor/")
            ) {
              return "editor-monaco";
            }
            if (
              normalizedId.includes("/@apollo/") ||
              normalizedId.includes("/graphql") ||
              normalizedId.includes("/@vue/apollo-composable/")
            ) {
              return "data-graphql";
            }
            if (
              normalizedId.includes("/vue/") ||
              normalizedId.includes("/pinia/") ||
              normalizedId.includes("/vue-router/") ||
              normalizedId.includes("/vue-i18n/") ||
              normalizedId.includes("/@unhead/")
            ) {
              return "core-vue";
            }
            if (normalizedId.includes("/oh-vue-icons/")) {
              return "visual-icons";
            }
          },
        },
      },
    },
  };
});
