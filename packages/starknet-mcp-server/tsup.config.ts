import { defineConfig } from "tsup";

export default defineConfig({
  // These workspace packages are private and never published, so they are
  // inlined into dist rather than left as runtime imports. Their own runtime
  // dependencies (x402-starknet needs `starknet` and `zod`) must be listed in this
  // package's `dependencies` so they stay external and get installed.
  noExternal: [
    "@starknetfoundation/starknet-agentic-shared",
    "@starknetfoundation/starknet-agentic-x402-starknet",
  ],
});
