import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";
import autoImports from './.wxt/eslint-auto-imports.mjs';
import reactYouMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
    autoImports,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ["**/*.mjs", "vite.*.config.mjs"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat['jsx-runtime'],
  reactYouMightNotNeedAnEffect.configs.recommended,
  reactHooks.configs['recommended-latest'],
  {
    rules: {
      'react/prop-types': 'off',
      'react/display-name': ['error', { ignoreTranspilerName: false }],
    }
  }
]);
