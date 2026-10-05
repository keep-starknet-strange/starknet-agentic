import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkMcpServerHealth,
  createRedactor,
  extractEnvProblems,
  isSensitiveEnvKey,
  redactUrl,
  resolveLaunchEnv,
  type McpServerLaunch,
  type SignalSource,
} from "../mcp-handshake.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const FAKE_SERVER = path.join(fixturesDir, "fake-mcp-server.mjs");
const FAKE_NPX = path.join(fixturesDir, "fake-npx.mjs");

const PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd";
const RPC_WITH_KEY = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/abcdefghijklmnopqrstuvwxyz123456";
const VALID_ENV = {
  STARKNET_RPC_URL: "https://rpc.example.com/rpc/v0_10",
  STARKNET_ACCOUNT_ADDRESS: "0x1",
  STARKNET_PRIVATE_KEY: "0x1",
};

/** Base env for the spawned fake server: just enough to run node. */
const baseEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env.PATH });

function fakeServer(env: Record<string, string> = {}): McpServerLaunch {
  return { command: process.execPath, args: [FAKE_SERVER], env };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPids(file: string): number[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => Number(line));
}

async function waitFor(condition: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

class FakeSignals extends EventEmitter implements SignalSource {}

let tmpDir: string;
let pidFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "csa-mcp-handshake-"));
  pidFile = path.join(tmpDir, "pids");
});

afterEach(() => {
  // Safety net: never leave a fake server behind, even if a test failed.
  for (const pid of readPids(pidFile)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("checkMcpServerHealth", () => {
  it("reports serverInfo and tool count after a successful handshake", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({ ...VALID_ENV, FAKE_MCP_REQUIRE_ENV: "1", FAKE_MCP_PID_FILE: pidFile }),
      { baseEnv: baseEnv(), timeoutMs: 10_000 }
    );

    expect(result).toMatchObject({
      ok: true,
      status: "ok",
      serverName: "starknet-mcp-server",
      serverVersion: "0.2.0",
      protocolVersion: "2025-06-18",
      toolCount: 3,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBeUndefined();
    const [pid] = readPids(pidFile);
    expect(isAlive(pid)).toBe(false);
  });

  it("expands ${VAR} and ${VAR:-default} placeholders from the client environment", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({
        STARKNET_RPC_URL: "${MY_RPC:-https://rpc.example.com/rpc/v0_10}",
        STARKNET_ACCOUNT_ADDRESS: "${STARKNET_ACCOUNT_ADDRESS}",
        STARKNET_PRIVATE_KEY: "${env:STARKNET_PRIVATE_KEY}",
        FAKE_MCP_REQUIRE_ENV: "1",
      }),
      {
        baseEnv: { ...baseEnv(), STARKNET_ACCOUNT_ADDRESS: "0x1", STARKNET_PRIVATE_KEY: "0x1" },
        timeoutMs: 10_000,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.unresolvedEnv).toBeUndefined();
  });

  it("handles server notifications, server-to-client pings and paginated tools/list", async () => {
    const result = await checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "chatty", FAKE_MCP_VERSION: "9.9.9" }), {
      baseEnv: baseEnv(),
      timeoutMs: 10_000,
    });

    expect(result).toMatchObject({ ok: true, serverVersion: "9.9.9", toolCount: 5 });
  });

  it("reports missing required env vars as a configuration problem", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({
        FAKE_MCP_REQUIRE_ENV: "1",
        STARKNET_ACCOUNT_ADDRESS: "${STARKNET_ACCOUNT_ADDRESS}",
        STARKNET_PRIVATE_KEY: "${STARKNET_PRIVATE_KEY}",
      }),
      { baseEnv: baseEnv(), timeoutMs: 10_000 }
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("missing-env");
    expect(result.missingEnv).toEqual(["STARKNET_RPC_URL", "STARKNET_ACCOUNT_ADDRESS"]);
    expect(result.unresolvedEnv).toEqual(["STARKNET_ACCOUNT_ADDRESS", "STARKNET_PRIVATE_KEY"]);
    expect(result.message).toContain("missing or invalid environment variables: STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS");
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toContain("ZodError");
  });

  it("names a missing private key", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({
        FAKE_MCP_REQUIRE_ENV: "1",
        STARKNET_RPC_URL: VALID_ENV.STARKNET_RPC_URL,
        STARKNET_ACCOUNT_ADDRESS: "0x1",
      }),
      { baseEnv: baseEnv(), timeoutMs: 10_000 }
    );

    expect(result.status).toBe("missing-env");
    expect(result.missingEnv).toEqual(["STARKNET_PRIVATE_KEY"]);
  });

  it("times out, then kills the server", async () => {
    const result = await checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "hang", FAKE_MCP_PID_FILE: pidFile }), {
      baseEnv: baseEnv(),
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("timeout");
    expect(result.message).toBe("MCP server did not complete the handshake within 0.5s");
    expect(result.exitCode).toBeUndefined();
    const [pid] = readPids(pidFile);
    expect(isAlive(pid)).toBe(false);
  });

  it("escalates to SIGKILL when the server ignores SIGTERM", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({ FAKE_MCP_MODE: "ignore-sigterm", FAKE_MCP_PID_FILE: pidFile }),
      { baseEnv: baseEnv(), timeoutMs: 300 }
    );

    expect(result.status).toBe("timeout");
    const [pid] = readPids(pidFile);
    expect(isAlive(pid)).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "kills the whole process tree when the server runs behind a launcher like npx",
    async () => {
      const result = await checkMcpServerHealth(
        {
          command: process.execPath,
          args: [FAKE_NPX, FAKE_SERVER],
          env: { FAKE_MCP_MODE: "hang", FAKE_MCP_PID_FILE: pidFile },
        },
        { baseEnv: baseEnv(), timeoutMs: 800 }
      );

      expect(result.status).toBe("timeout");
      const pids = readPids(pidFile);
      expect(pids).toHaveLength(2); // launcher + server
      // The orphaned server is reaped by init, which can take a moment.
      await waitFor(() => pids.every((pid) => !isAlive(pid)), 3_000);
    }
  );

  it("rejects non-JSON output on stdout", async () => {
    const result = await checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "garbage" }), {
      baseEnv: baseEnv(),
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("protocol-error");
    expect(result.message).toContain("non-JSON-RPC output");
    expect(result.message).toContain("this is not json-rpc");
  });

  it("redacts secrets in stdout output before truncating it", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({ FAKE_MCP_MODE: "garbage-secret", STARKNET_PRIVATE_KEY: PRIVATE_KEY }),
      { baseEnv: baseEnv(), timeoutMs: 10_000 }
    );

    expect(result.status).toBe("protocol-error");
    expect(result.message).not.toContain("0123456789abcdef");
  });

  it("rejects an initialize result without serverInfo", async () => {
    const result = await checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "no-server-info" }), {
      baseEnv: baseEnv(),
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("protocol-error");
    expect(result.message).toContain("malformed initialize response");
  });

  it("reports a JSON-RPC error returned for initialize", async () => {
    const result = await checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "rpc-error" }), {
      baseEnv: baseEnv(),
      timeoutMs: 10_000,
    });

    expect(result.status).toBe("protocol-error");
    expect(result.message).toBe("MCP server rejected initialize: Unsupported protocol version (code -32602)");
  });

  it("reports a server that exits before the handshake, with its stderr", async () => {
    const result = await checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "exit-early" }), {
      baseEnv: baseEnv(),
      timeoutMs: 10_000,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("exited");
    expect(result.exitCode).toBe(3);
    expect(result.message).toBe(
      "MCP server exited with code 3 before completing the MCP handshake: boom: fake server crashed during startup"
    );
  });

  it("reports a command that cannot be started", async () => {
    const result = await checkMcpServerHealth(
      { command: "definitely-not-a-real-command-csa", args: [] },
      { baseEnv: baseEnv(), timeoutMs: 10_000 }
    );

    expect(result.status).toBe("spawn-error");
    expect(result.message).toBe('Could not start MCP server command "definitely-not-a-real-command-csa": command not found');
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it("never returns secrets from the server's stderr", async () => {
    const result = await checkMcpServerHealth(
      fakeServer({ FAKE_MCP_MODE: "leak", STARKNET_PRIVATE_KEY: PRIVATE_KEY, STARKNET_RPC_URL: RPC_WITH_KEY }),
      { baseEnv: baseEnv(), timeoutMs: 10_000 }
    );

    const output = JSON.stringify(result);
    expect(result.status).toBe("exited");
    expect(output).not.toContain(PRIVATE_KEY.slice(2));
    expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(output).toContain("[redacted]");
  });

  it("kills the server on SIGINT and hands control to onSignal", async () => {
    const signals = new FakeSignals();
    const onSignal = vi.fn();
    const pending = checkMcpServerHealth(fakeServer({ FAKE_MCP_MODE: "hang", FAKE_MCP_PID_FILE: pidFile }), {
      baseEnv: baseEnv(),
      timeoutMs: 30_000,
      signalSource: signals,
      onSignal,
    });

    await waitFor(() => readPids(pidFile).length === 1);
    const [pid] = readPids(pidFile);
    signals.emit("SIGINT");

    await waitFor(() => !isAlive(pid));
    expect(onSignal).toHaveBeenCalledWith("SIGINT");
    const result = await pending;
    expect(result.ok).toBe(false);
    // Listeners are removed once the check is over.
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("exit")).toBe(0);
  });

  it("removes its signal listeners after a successful check", async () => {
    const signals = new FakeSignals();
    const result = await checkMcpServerHealth(fakeServer(), {
      baseEnv: baseEnv(),
      timeoutMs: 10_000,
      signalSource: signals,
    });

    expect(result.ok).toBe(true);
    expect(signals.eventNames()).toEqual([]);
  });
});

describe("resolveLaunchEnv", () => {
  it("overlays the config env on the client environment", () => {
    const { env, unresolved } = resolveLaunchEnv({ A: "1", B: "${X}-${Y:-y}" }, { PATH: "/bin", X: "x" });
    expect(env).toEqual({ PATH: "/bin", X: "x", A: "1", B: "x-y" });
    expect(unresolved).toEqual([]);
  });

  it("drops values whose placeholders are unset instead of passing ${VAR} literally", () => {
    const { env, unresolved } = resolveLaunchEnv(
      { STARKNET_PRIVATE_KEY: "${STARKNET_PRIVATE_KEY}", KEEP: "yes" },
      { PATH: "/bin" }
    );
    expect(env).toEqual({ PATH: "/bin", KEEP: "yes" });
    expect(unresolved).toEqual(["STARKNET_PRIVATE_KEY"]);
  });

  it("treats an empty variable as unset", () => {
    const { unresolved } = resolveLaunchEnv({ A: "${EMPTY}" }, { EMPTY: "" });
    expect(unresolved).toEqual(["EMPTY"]);
  });
});

describe("redaction", () => {
  it("treats names containing a secret word, or ending in _URL, as sensitive", () => {
    for (const key of [
      "STARKNET_PRIVATE_KEY",
      "AVNU_PAYMASTER_API_KEY",
      "AVNU_APIKEY",
      "KEYRING_HMAC_SECRET",
      "GITHUB_TOKEN",
      "WALLET_MNEMONIC",
      "STARKNET_RPC_URL",
      "avnu_paymaster_url",
    ]) {
      expect(isSensitiveEnvKey(key), key).toBe(true);
    }
    for (const key of ["STARKNET_ACCOUNT_ADDRESS", "STARKNET_NETWORK", "URL_PREFIX", "NODE_ENV"]) {
      expect(isSensitiveEnvKey(key), key).toBe(false);
    }
  });

  it("redacts API keys in URL paths, query strings and userinfo", () => {
    expect(redactUrl(RPC_WITH_KEY)).toBe(
      "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/[redacted]"
    );
    expect(redactUrl("https://user:pass@rpc.example.com/rpc?apikey=s3cr3t")).toBe(
      "https://redacted:redacted@rpc.example.com/rpc?apikey=redacted"
    );
    expect(redactUrl("https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10")).toBe(
      "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10"
    );
  });

  it("redacts sensitive env values, long hex strings and keyed URLs from text", () => {
    const redact = createRedactor({ STARKNET_PRIVATE_KEY: "0xdeadbeefcafe", AVNU_PAYMASTER_API_KEY: "pm-key-123" });
    const text = `key=0xdeadbeefcafe api=pm-key-123 addr=0x${"a".repeat(64)} url=${RPC_WITH_KEY}`;
    const out = redact(text);
    expect(out).not.toContain("deadbeefcafe");
    expect(out).not.toContain("pm-key-123");
    expect(out).not.toContain("a".repeat(64));
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });
});

describe("extractEnvProblems", () => {
  it("reads the zod error printed by starknet-agentic-mcp-server 0.2.0", () => {
    // Trimmed stderr of `npx -y @starknetfoundation/starknet-agentic-mcp-server@0.2.0` with no env.
    const stderr = `file:///home/.npm/_npx/1bca775f8453e228/node_modules/@starknetfoundation/starknet-agentic-mcp-server/dist/index.js:3276
var env = envSchema.parse({
                    ^

ZodError: [
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "STARKNET_RPC_URL"
    ],
    "message": "Invalid input: expected string, received undefined"
  },
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "STARKNET_ACCOUNT_ADDRESS"
    ],
    "message": "Invalid input: expected string, received undefined"
  }
]`;
    expect(extractEnvProblems(stderr)).toEqual(["STARKNET_RPC_URL", "STARKNET_ACCOUNT_ADDRESS"]);
  });

  it("reads Missing X and Missing ... (X, Y) errors", () => {
    expect(extractEnvProblems("Error: Missing STARKNET_PRIVATE_KEY for STARKNET_SIGNER_MODE=direct")).toEqual([
      "STARKNET_PRIVATE_KEY",
    ]);
    expect(
      extractEnvProblems(
        "Error: Missing keyring proxy configuration for STARKNET_SIGNER_MODE=proxy (KEYRING_PROXY_URL, KEYRING_HMAC_SECRET)"
      )
    ).toEqual(["KEYRING_PROXY_URL", "KEYRING_HMAC_SECRET"]);
  });

  it("returns nothing for unrelated errors", () => {
    expect(extractEnvProblems("npm error 404 Not Found")).toEqual([]);
  });
});
