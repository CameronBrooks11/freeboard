import * as path from "path";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import dns from "dns";

dns.setDefaultResultOrder?.("ipv4first");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const API_HOST = env.FREEBOARD_API_HOST || "127.0.0.1";
  const API_PORT = Number(env.FREEBOARD_API_PORT || 4001);
  const PROXY_HOST = env.FREEBOARD_PROXY_HOST || "127.0.0.1";
  const PROXY_PORT = Number(env.FREEBOARD_PROXY_PORT || 8001);

  const isStatic = JSON.stringify(process.env.FREEBOARD_STATIC);

  return {
    plugins: [vue()],
    base: isStatic ? "/freeboard/" : "/",
    resolve: {
      alias: {
        "~": path.resolve(
          __dirname,
          env.FREEBOARD_NODE_MODULES || "./../../node_modules"
        ),
      },
    },
    define: {
      __FREEBOARD_VERSION__: JSON.stringify(process.env.npm_package_version),
      __FREEBOARD_STATIC__: isStatic,
    },
    server: {
      host: true,
      strictPort: false,
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
