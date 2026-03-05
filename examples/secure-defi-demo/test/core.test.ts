import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { parseCliArgs, loadRunConfig } from "../src/config.js";
import { DemoArtifactSchema, buildSummary } from "../src/types.js";

const originalArgv = [...process.argv];
const originalEnv = { ...process.env };

function restoreProcessState(): void {
  process.argv = [...originalArgv];
  process.env = { ...originalEnv };
}

test.beforeEach(() => {
  restoreProcessState();
});

test.afterEach(() => {
  restoreProcessState();
});

test("buildSummary counts statuses correctly", () => {
  const summary = buildSummary([
    {
      id: "a",
      title: "A",
      status: "ok",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    },
    {
      id: "b",
      title: "B",
      status: "failed",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      error: "boom",
    },
    {
      id: "c",
      title: "C",
      status: "skipped",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    },
  ]);

  assert.equal(summary.totalSteps, 3);
  assert.equal(summary.ok, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 1);
});

test("DemoArtifactSchema accepts valid artifact", () => {
  const now = new Date().toISOString();
  const parsed = DemoArtifactSchema.parse({
    runId: "run-1",
    issue: "https://github.com/keep-starknet-strange/starknet-agentic/issues/311",
    mode: "dry-run",
    networkLabel: "starknet-sepolia",
    startedAt: now,
    endedAt: now,
    accountAddress: "0x123",
    signerMode: "direct",
    steps: [
      {
        id: "startup",
        title: "Start",
        status: "ok",
        startedAt: now,
        endedAt: now,
      },
    ],
    summary: {
      totalSteps: 1,
      ok: 1,
      failed: 0,
      skipped: 0,
    },
    recommendations: [],
  });

  assert.equal(parsed.summary.ok, 1);
});

test("parseCliArgs validates mode", () => {
  process.argv = ["node", "run.ts", "--mode", "bad-mode"];
  assert.throws(() => parseCliArgs(), /--mode must be one of/);
});

test("loadRunConfig requires private key in direct mode", () => {
  process.argv = ["node", "run.ts", "--mode", "dry-run"];
  process.env.STARKNET_SIGNER_MODE = "direct";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  delete process.env.STARKNET_PRIVATE_KEY;

  const args = parseCliArgs();
  assert.throws(() => loadRunConfig(args), /Missing required env var: STARKNET_PRIVATE_KEY/);
});

test("loadRunConfig requires proxy credentials in proxy mode", () => {
  process.argv = ["node", "run.ts", "--mode", "dry-run"];
  process.env.STARKNET_SIGNER_MODE = "proxy";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  delete process.env.KEYRING_PROXY_URL;
  delete process.env.KEYRING_HMAC_SECRET;

  const args = parseCliArgs();
  assert.throws(() => loadRunConfig(args), /Missing required env var: KEYRING_PROXY_URL/);
});

test("loadRunConfig enforces execute mode for strict security proof", () => {
  process.argv = ["node", "run.ts", "--mode", "dry-run"];
  process.env.STARKNET_SIGNER_MODE = "direct";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.STARKNET_PRIVATE_KEY = "0xabc";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  process.env.STRICT_SECURITY_PROOF = "1";

  const args = parseCliArgs();
  assert.throws(() => loadRunConfig(args), /STRICT_SECURITY_PROOF requires --mode execute/);
});

test("loadRunConfig requires Starkzap evidence path when Starkzap proof is enabled", () => {
  process.argv = ["node", "run.ts", "--mode", "execute"];
  process.env.STARKNET_SIGNER_MODE = "direct";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.STARKNET_PRIVATE_KEY = "0xabc";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  process.env.DEMO_ENABLE_STARKZAP_PROOF = "1";
  delete process.env.DEMO_STARKZAP_EVIDENCE_PATH;

  const args = parseCliArgs();
  assert.throws(
    () => loadRunConfig(args),
    /DEMO_STARKZAP_EVIDENCE_PATH is required when DEMO_ENABLE_STARKZAP_PROOF=1/,
  );
});

test("loadRunConfig requires evidence signing key inputs for strict mode", () => {
  process.argv = ["node", "run.ts", "--mode", "execute"];
  process.env.STARKNET_SIGNER_MODE = "direct";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.STARKNET_PRIVATE_KEY = "0xabc";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  process.env.STRICT_SECURITY_PROOF = "1";
  delete process.env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PEM;
  delete process.env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PATH;
  delete process.env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_BASE64;

  const args = parseCliArgs();
  assert.throws(
    () => loadRunConfig(args),
    /STRICT_SECURITY_PROOF requires one of DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PEM/,
  );
});

test("loadRunConfig accepts strict mode when evidence signing key is provided", () => {
  process.argv = ["node", "run.ts", "--mode", "execute"];
  process.env.STARKNET_SIGNER_MODE = "direct";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.STARKNET_PRIVATE_KEY = "0xabc";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  process.env.STRICT_SECURITY_PROOF = "1";
  process.env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PEM = "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----";

  const args = parseCliArgs();
  const cfg = loadRunConfig(args);
  assert.equal(cfg.strictSecurityProof, true);
  assert.equal(Boolean(cfg.evidenceSigningPrivateKeyPem), true);
});
