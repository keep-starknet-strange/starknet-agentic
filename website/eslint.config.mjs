// ESLint flat config for the Next.js website (`next lint` was removed in
// Next.js 16, so the `lint` script runs the ESLint CLI directly).
//
// This config does not use `eslint-config-next`: its `@next/eslint-plugin-next`
// pins `fast-glob@3.3.1` -> `micromatch` -> `braces@3.0.3`, which has an
// unpatched high-severity advisory (GHSA-vfj7-8cjw-p6xm). It keeps the parts
// of that preset that apply to this app-router site: TypeScript rules, the
// React Hooks / React Compiler rules, and the jsx-a11y subset it enabled.
// The `@next/next/*` rules (mostly pages-router `_document`/`<Head>` checks),
// `eslint-plugin-react` (no ESLint 10 support) and `import/no-anonymous-default-export`
// are not carried over.
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    plugins: { "jsx-a11y": jsxA11y },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Same jsx-a11y subset and severity as eslint-config-next.
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      // React Compiler rule from eslint-plugin-react-hooks v7. Existing hits
      // are mount/hydration flags whose fix is a component refactor, not a
      // mechanical change. Tracked as a follow-up.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
