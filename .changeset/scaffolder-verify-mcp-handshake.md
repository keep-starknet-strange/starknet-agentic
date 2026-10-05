---
"@starknetfoundation/create-starknet-agent": minor
---

`verify` now checks that the MCP server actually works.

- The MCP check starts the server from your MCP config (its `command`, `args` and `env`, with `${VAR}` placeholders expanded from your environment) and performs an MCP `initialize` handshake and `tools/list` over stdio. It reports the server's name, version and tool count. Before, it ran the server with `--help`, a flag the server does not have, so the check failed or proved nothing.
- When the server refuses to start because environment variables are missing or invalid, `verify` names them and reports a configuration problem. `--verbose` shows the server's stderr, with private keys, API keys and RPC URL secrets redacted.
- The check has a hard timeout (default 60s, `--timeout <seconds>`) and always stops the server and anything it started, also on Ctrl-C.
- A server that does not complete the handshake, an MCP config that is not valid JSON, or a config without a `starknet` server now exit with code 1 (configuration error). Missing credentials still exit with code 2.
- In `--json` output, `mcp.serverVersion` is now the version the server reports. The version pinned in the config moved to `mcp.configuredVersion`, and the handshake result is under `mcp.handshake`.
