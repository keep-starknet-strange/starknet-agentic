import { createRequire } from "node:module";

/**
 * This package's version, as reported to MCP clients in `serverInfo`.
 *
 * Read from package.json at runtime: both src/version.ts and the bundled
 * dist/index.js sit one level below it, and npm always ships package.json,
 * so the reported version follows every release without a code change.
 */
export const SERVER_VERSION: string = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;
