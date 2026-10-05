import { defineConfig } from "tsup";
import { templateVersionDefines } from "./scripts/template-versions.js";

export default defineConfig({
  // @starknetfoundation/starknet-agentic-shared is private and never published,
  // so it is inlined into dist rather than left as a runtime import.
  noExternal: ["@starknetfoundation/starknet-agentic-shared"],
  // Inline the dependency ranges generated projects use, read from the
  // workspace catalog at build time (see scripts/template-versions.ts).
  define: templateVersionDefines(),
});
