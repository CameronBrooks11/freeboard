import globals from "globals";
import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["**/dist/**", "**/dist-ssr/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    languageOptions: {
      globals: {
        ...globals.node,        // add Node globals like `process`
      },
    },
    rules: {
      "no-unused-vars": 1,
      "no-undef": 1,
      "no-redeclare": 1,
      "no-prototype-builtins": 1,
      "no-cond-assign": 1,
      "no-empty": 1,
      "no-shadow-restricted-names": 1,
      "no-constant-binary-expression": 1,
      "no-useless-escape": 1,
      "no-unexpected-multiline": 1,
      "no-constant-condition": 1,
      "no-fallthrough": 1,
      "no-self-assign": 1,
      "no-control-regex": 1,
      "no-func-assign": 1,
      "no-misleading-character-class": 1,
      "no-useless-catch": 1,
      "no-delete-var": 1,
      "no-extra-boolean-cast": 1,
    },
  },
  { languageOptions: { globals: globals.browser } },
  {
    files: ["packages/ui/src/**/*.{js,mjs,cjs,vue}"],
    languageOptions: {
      globals: {
        __FREEBOARD_VERSION__: "readonly",
        __FREEBOARD_STATIC__: "readonly",
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-reserved-component-names": "off",
      "vue/no-mutating-props": "off",
    },
  },
];
