import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";

let eslintConfigPrettier = null;
try {
  const prettierModule = await import("eslint-config-prettier");
  eslintConfigPrettier = prettierModule.default ?? prettierModule;
} catch {
  // Allow lint to run even before local dependencies are fully synchronized.
}

export default [
  {
    name: "app/files-to-lint",
    files: ["**/*.{js,mjs,jsx,vue}"],
  },

  {
    name: "app/files-to-ignore",
    ignores: ["**/dist/**", "**/dist-ssr/**", "**/coverage/**"],
  },

  js.configs.recommended,
  {
    name: "app/compile-time-globals",
    languageOptions: {
      globals: {
        __FREEBOARD_VERSION__: "readonly",
        __FREEBOARD_STATIC__: "readonly",
      },
    },
  },
  ...pluginVue.configs["flat/essential"],
  {
    name: "app/vue-rules-override",
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-reserved-component-names": "off",
      "vue/no-mutating-props": "off",
    },
  },
  ...(eslintConfigPrettier ? [eslintConfigPrettier] : []),
];
