import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

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
    name: "app/typescript",
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    name: "app/vue-typescript",
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
  },
  {
    name: "app/compile-time-globals",
    languageOptions: {
      globals: {
        __FREEBOARD_VERSION__: "readonly",
        __FREEBOARD_STATIC__: "readonly",
        __FREEBOARD_BASE_PATH__: "readonly",
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
