// ESLint flat config for the Next.js website. Replaces the legacy
// .eslintrc.json, which ESLint 9+ no longer reads; `next lint` was removed
// in Next.js 16, so the `lint` script runs the ESLint CLI directly.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      // eslint-plugin-react 7.x (latest) does not support ESLint 10: its
      // "detect" mode calls the removed context.getFilename(). Pinning the
      // React major skips detection. Keep in sync with the `react` dependency.
      react: { version: "19" },
    },
  },
  {
    rules: {
      // React Compiler rule from eslint-plugin-react-hooks v7. Existing hits
      // are mount/hydration flags whose fix is a component refactor, not a
      // mechanical change. Tracked as a follow-up.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
