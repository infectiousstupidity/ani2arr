import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";
import autoImports from "./.wxt/eslint-auto-imports.mjs";
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import reactHooks from "eslint-plugin-react-hooks";
import playwright from 'eslint-plugin-playwright'
import testingLibrary from 'eslint-plugin-testing-library'

export default defineConfig([
  autoImports,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.mjs", "vite.*.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // TypeScript + React base
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
  reactYouMightNotNeedAnEffect.configs.recommended,
  reactHooks.configs["recommended-latest"],

  // Project-wide rules
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/prop-types": "off",
      "react/display-name": ["error", { ignoreTranspilerName: false }],
    },
  },

  // Tests override (Vitest + "_" ignore patterns)
  {
    files: [
      "**/*.test.{ts,tsx,js,jsx}",
      "**/__tests__/**/*.{ts,tsx,js,jsx}",
      "src/**/tests/**/*.{ts,tsx,js,jsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Playwright tests
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
    },
  },
  // Testing Library (React)
  {
    ...testingLibrary.configs['flat/react'],
    files: [
      "**/*.test.{ts,tsx,js,jsx}",
      "**/__tests__/**/*.{ts,tsx,js,jsx}",
      "src/**/tests/**/*.{ts,tsx,js,jsx}",
      "tests/**",
    ],
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
    },
  },
]);
