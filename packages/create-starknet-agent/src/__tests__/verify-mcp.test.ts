import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetectedPlatform } from "../types.js";
import { EXIT_CODES } from "../index.js";
import { checkMcpServer, computeVerifyExitCode, describeMcpFailure, type McpCheckResult } from "../verify.js";

const FAKE_SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-mcp-server.mjs");
const PACKAGE_ARG = "@starknetfoundation/starknet-agentic-mcp-server@0.2.0";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "csa-verify-mcp-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function platformWithConfig(config: unknown | string): DetectedPlatform {
  const configPath = path.join(tmpDir, "mcp.json");
  fs.writeFileSync(configPath, typeof config === "string" ? config : JSON.stringify(config, null, 2));
  return {
    type: "generic-mcp",
    name: "Generic MCP",
    configPath,
    isAgentInitiated: true,
    confidence: "high",
    detectedBy: "test",
  };
}

/** The shape create-starknet-agent writes, pointed at the fake server instead of npx. */
function starknetEntry(env: Record<string, string>) {
  return {
    mcpServers: {
      starknet: { command: process.execPath, args: [FAKE_SERVER, PACKAGE_ARG], env },
    },
  };
}

const options = { baseEnv: { PATH: process.env.PATH }, timeoutMs: 10_000 };

describe("checkMcpServer", () => {
  it("starts the configured server and reports the handshake", async () => {
    const platform = platformWithConfig(
      starknetEntry({
        FAKE_MCP_REQUIRE_ENV: "1",
        STARKNET_RPC_URL: "https://rpc.example.com/rpc/v0_10",
        STARKNET_ACCOUNT_ADDRESS: "0x1",
        STARKNET_PRIVATE_KEY: "0x1",
      })
    );

    const mcp = await checkMcpServer(platform, options);

    expect(mcp).toMatchObject({
      configExists: true,
      serverConfigured: true,
      serverResponds: true,
      configuredVersion: "0.2.0",
      serverName: "starknet-mcp-server",
      serverVersion: "0.2.0",
      toolCount: 3,
    });
    expect(mcp.serverCommand).toContain(PACKAGE_ARG);
    expect(describeMcpFailure(mcp, 10_000)).toBeUndefined();
    expect(computeVerifyExitCode(mcp, { privateKeyPresent: true, accountAddressPresent: true })).toBe(
      EXIT_CODES.SUCCESS
    );
  });

  it("calls onHandshakeStart with the redacted command before starting the server", async () => {
    const platform = platformWithConfig(starknetEntry({}));
    const started: string[] = [];

    await checkMcpServer(platform, { ...options, onHandshakeStart: (cmd) => started.push(cmd) });

    expect(started).toHaveLength(1);
    expect(started[0]).toContain(PACKAGE_ARG);
  });

  it("reports missing env vars as a configuration error", async () => {
    const platform = platformWithConfig(
      starknetEntry({
        FAKE_MCP_REQUIRE_ENV: "1",
        STARKNET_PRIVATE_KEY: "${STARKNET_PRIVATE_KEY}",
        STARKNET_ACCOUNT_ADDRESS: "${STARKNET_ACCOUNT_ADDRESS}",
      })
    );

    const mcp = await checkMcpServer(platform, options);
    const failure = describeMcpFailure(mcp, 10_000);

    expect(mcp.serverResponds).toBe(false);
    expect(mcp.handshake?.status).toBe("missing-env");
    expect(failure?.message).toBe(
      "MCP server refused to start: missing or invalid environment variables: STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS (configuration problem)"
    );
    expect(failure?.hint).toContain(platform.configPath);
    expect(mcp.handshake?.unresolvedEnv).toEqual(["STARKNET_PRIVATE_KEY", "STARKNET_ACCOUNT_ADDRESS"]);
    expect(computeVerifyExitCode(mcp, { privateKeyPresent: true, accountAddressPresent: true })).toBe(
      EXIT_CODES.CONFIG_ERROR
    );
  });

  it("suggests a longer timeout when the handshake times out", async () => {
    const platform = platformWithConfig(starknetEntry({ FAKE_MCP_MODE: "hang" }));

    const mcp = await checkMcpServer(platform, { ...options, timeoutMs: 300 });
    const failure = describeMcpFailure(mcp, 300);

    expect(mcp.handshake?.status).toBe("timeout");
    expect(failure?.hint).toContain("--timeout 120");
  });

  it("does not echo an unparsable config, which may contain secrets", async () => {
    const secret = "0x" + "b".repeat(64);
    const platform = platformWithConfig(`{"mcpServers": {"starknet": {"env": {"STARKNET_PRIVATE_KEY": "${secret}"`);

    const mcp = await checkMcpServer(platform, options);

    expect(mcp.configError).toBe("not valid JSON");
    expect(JSON.stringify(mcp)).not.toContain("b".repeat(64));
    expect(computeVerifyExitCode(mcp, { privateKeyPresent: true, accountAddressPresent: true })).toBe(
      EXIT_CODES.CONFIG_ERROR
    );
  });

  it("does not start anything when the starknet entry is missing", async () => {
    const platform = platformWithConfig({ mcpServers: { other: { command: "echo" } } });

    const mcp = await checkMcpServer(platform, options);

    expect(mcp).toMatchObject({ configExists: true, serverConfigured: false, serverResponds: false });
    expect(mcp.handshake).toBeUndefined();
  });

  it("explains that an entry without a command cannot be checked", async () => {
    const platform = platformWithConfig({ mcpServers: { starknet: { url: "https://example.com/mcp" } } });

    const mcp = await checkMcpServer(platform, options);

    expect(mcp.serverConfigured).toBe(true);
    expect(mcp.handshake).toBeUndefined();
    expect(describeMcpFailure(mcp, 10_000)?.message).toContain('no "command"');
  });
});

describe("computeVerifyExitCode", () => {
  const ok: McpCheckResult = { configExists: true, serverConfigured: true, serverResponds: true };
  const creds = { privateKeyPresent: true, accountAddressPresent: true };
  const noCreds = { privateKeyPresent: false, accountAddressPresent: true };

  it.each([
    ["everything passes", ok, creds, EXIT_CODES.SUCCESS],
    ["config missing", { ...ok, configExists: false }, creds, EXIT_CODES.CONFIG_ERROR],
    ["config unparsable", { ...ok, configError: "not valid JSON" }, creds, EXIT_CODES.CONFIG_ERROR],
    ["server not configured", { ...ok, serverConfigured: false }, creds, EXIT_CODES.CONFIG_ERROR],
    ["credentials missing", ok, noCreds, EXIT_CODES.MISSING_CREDENTIALS],
    ["credentials missing and handshake failed", { ...ok, serverResponds: false }, noCreds, EXIT_CODES.MISSING_CREDENTIALS],
    ["handshake failed", { ...ok, serverResponds: false }, creds, EXIT_CODES.CONFIG_ERROR],
  ])("%s", (_name, mcp, credentials, expected) => {
    expect(computeVerifyExitCode(mcp, credentials)).toBe(expected);
  });
});
