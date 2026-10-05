// ESLint config for the plain-JS deploy scripts in contracts/*/scripts/.
// It enables only no-undef, so a call to a missing helper (for example the
// normalizeNetwork() ReferenceError fixed in #622) fails CI without running
// the script. The scripts are ESM, so only Node builtins count as globals:
// require, module and __dirname must be imported or defined.
//
// Run from the repo root:
//   pnpm exec eslint -c contracts/eslint.scripts.config.mjs 'contracts/*/scripts/*.js'
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig([
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
]);
