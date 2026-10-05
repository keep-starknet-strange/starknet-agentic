import { defineConfig } from "vitest/config";
import { templateVersionDefines } from "./scripts/template-versions.js";

export default defineConfig({
  // Same values tsup inlines into dist, so tests run against the ranges the
  // published CLI writes (see scripts/template-versions.ts).
  define: templateVersionDefines(),
});
