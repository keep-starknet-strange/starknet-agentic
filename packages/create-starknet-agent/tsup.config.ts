import { defineConfig } from "tsup";

export default defineConfig({
  // @starknetfoundation/starknet-agentic-shared is private and never published,
  // so it is inlined into dist rather than left as a runtime import.
  noExternal: ["@starknetfoundation/starknet-agentic-shared"],
});
