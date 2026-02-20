import globals from "globals";
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

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/dist-ssr/**",
      "**/coverage/**",
      "docs/auto/**",
      "docs/public/dev/**",
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    languageOptions: {
      globals: {
        ...globals.node, // add Node globals like `process`
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
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["packages/ui/src/**/*.{js,ts,mjs,cjs,vue}"],
    languageOptions: {
      globals: {
        __FREEBOARD_VERSION__: "readonly",
        __FREEBOARD_STATIC__: "readonly",
        __FREEBOARD_BASE_PATH__: "readonly",
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/no-reserved-component-names": "off",
      "vue/no-mutating-props": "off",
    },
  },
  {
    files: ["packages/{ui,api,gateway,shared}/src/**/*.{ts,vue}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
    },
  },
  {
    files: ["**/test/**/*.ts", "e2e/**/*.ts", "scripts/**/*.mjs"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  ...(eslintConfigPrettier ? [eslintConfigPrettier] : []),
];
