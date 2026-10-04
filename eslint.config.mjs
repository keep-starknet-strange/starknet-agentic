// Root ESLint flat config for the TypeScript workspace packages (packages/*)
// and examples. ESLint resolves the nearest eslint.config.* to each linted
// file, so `eslint .` inside any package picks this up. The Next.js website
// has its own config in website/eslint.config.mjs.
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "**/coverage/**",
    "**/.next/**",
    "**/*.d.ts",
    "website/**",
    "references/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Rules downgraded to "warn" because satisfying them needs broad rewrites
    // rather than mechanical fixes. Tracked as follow-ups; do not add new
    // violations.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // New in ESLint 10's recommended set. Fixing means attaching `{ cause }`
      // to rethrown errors, which changes the thrown error objects.
      "preserve-caught-error": "warn",
    },
  },
]);
