---
"@starknetfoundation/starknet-agentic-mcp-server": patch
---

Report the package's own version to MCP clients. `serverInfo.version` in the `initialize` response was hardcoded to `0.1.0`; it is now read from the package's `package.json`, so it matches the installed release.
