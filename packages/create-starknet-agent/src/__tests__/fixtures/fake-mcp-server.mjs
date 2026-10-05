#!/usr/bin/env node
/**
 * Tiny stand-in for starknet-agentic-mcp-server, used by the verify tests.
 * Speaks newline-delimited JSON-RPC over stdio. No network access.
 *
 * FAKE_MCP_MODE selects the behaviour:
 *   ok (default)    answer initialize and tools/list (3 tools)
 *   chatty          send a log notification and a ping request first, and
 *                   paginate tools/list (3 + 2 tools)
 *   hang            never answer, and keep running after stdin closes
 *   ignore-sigterm  like hang, and ignore SIGTERM
 *   garbage         answer initialize with a non-JSON line
 *   garbage-secret  answer initialize with a long non-JSON line ending in STARKNET_PRIVATE_KEY
 *   no-server-info  answer initialize without serverInfo
 *   rpc-error       answer initialize with a JSON-RPC error
 *   exit-early      print to stderr and exit 3 before reading anything
 *   leak            print STARKNET_PRIVATE_KEY and STARKNET_RPC_URL to stderr, exit 1
 *
 * FAKE_MCP_REQUIRE_ENV=1 makes startup fail like the real server when
 * STARKNET_RPC_URL / STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY are unset.
 * FAKE_MCP_PID_FILE, when set, receives this process's pid (one per line).
 * FAKE_MCP_VERSION overrides the reported serverInfo.version (default 0.2.0).
 */
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const mode = process.env.FAKE_MCP_MODE || "ok";

if (process.env.FAKE_MCP_PID_FILE) {
  appendFileSync(process.env.FAKE_MCP_PID_FILE, `${process.pid}\n`);
}

if (mode === "exit-early") {
  process.stderr.write("boom: fake server crashed during startup\n");
  process.exit(3);
}

if (mode === "leak") {
  process.stderr.write(
    `Error: cannot sign with key ${process.env.STARKNET_PRIVATE_KEY} via ${process.env.STARKNET_RPC_URL}\n`
  );
  process.exit(1);
}

if (process.env.FAKE_MCP_REQUIRE_ENV === "1") {
  // Same shapes as the real server: a zod error for the schema fields, then
  // an Error for the private key.
  const issues = ["STARKNET_RPC_URL", "STARKNET_ACCOUNT_ADDRESS"]
    .filter((name) => !process.env[name])
    .map((name) => ({
      expected: "string",
      code: "invalid_type",
      path: [name],
      message: "Invalid input: expected string, received undefined",
    }));
  if (issues.length > 0) {
    process.stderr.write(`file:///fake/dist/index.js:1\nvar env = envSchema.parse({\n                    ^\n\n`);
    process.stderr.write(`ZodError: ${JSON.stringify(issues, null, 2)}\n    at file:///fake/dist/index.js:1:21\n`);
    process.exit(1);
  }
  if (!process.env.STARKNET_PRIVATE_KEY) {
    process.stderr.write("Error: Missing STARKNET_PRIVATE_KEY for STARKNET_SIGNER_MODE=direct\n");
    process.exit(1);
  }
}

if (mode === "hang" || mode === "ignore-sigterm") {
  // Stay alive even after stdin closes, like a server stuck on a network call.
  setInterval(() => {}, 60_000);
}
if (mode === "ignore-sigterm") {
  process.on("SIGTERM", () => {});
}

process.stderr.write(`${JSON.stringify({ level: "info", event: "server.started" })}\n`);

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

const TOOLS_PAGE_1 = [{ name: "starknet_get_balance" }, { name: "starknet_transfer" }, { name: "starknet_swap" }];
const TOOLS_PAGE_2 = [{ name: "starknet_get_quote" }, { name: "starknet_call_contract" }];

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (mode === "hang" || mode === "ignore-sigterm") return;

  if (msg.method === "initialize") {
    if (mode === "garbage") {
      process.stdout.write("this is not json-rpc\n");
      return;
    }
    if (mode === "garbage-secret") {
      // Long enough that naive truncation would cut the key in half.
      process.stdout.write(`${"x".repeat(100)} ${process.env.STARKNET_PRIVATE_KEY}\n`);
      return;
    }
    if (mode === "rpc-error") {
      send({ id: msg.id, error: { code: -32602, message: "Unsupported protocol version" } });
      return;
    }
    if (mode === "chatty") {
      send({ method: "notifications/message", params: { level: "info", data: "hello" } });
      send({ id: "srv-1", method: "ping" });
    }
    const result = {
      protocolVersion: msg.params.protocolVersion,
      capabilities: { tools: {} },
    };
    if (mode !== "no-server-info") {
      result.serverInfo = { name: "starknet-mcp-server", version: process.env.FAKE_MCP_VERSION || "0.2.0" };
    }
    send({ id: msg.id, result });
    return;
  }

  if (msg.method === "tools/list") {
    if (mode === "chatty" && !msg.params?.cursor) {
      send({ id: msg.id, result: { tools: TOOLS_PAGE_1, nextCursor: "page-2" } });
    } else if (mode === "chatty") {
      send({ id: msg.id, result: { tools: TOOLS_PAGE_2 } });
    } else {
      send({ id: msg.id, result: { tools: TOOLS_PAGE_1 } });
    }
    return;
  }

  if (msg.id !== undefined && msg.method) {
    send({ id: msg.id, error: { code: -32601, message: "Method not found" } });
  }
});
