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
  restoreProcessState();
  process.argv = ["node", "run.ts", "--mode", "bad-mode"];
  assert.throws(() => parseCliArgs(), /--mode must be one of/);
});

test("loadRunConfig requires private key in execute/direct mode", () => {
  restoreProcessState();
  process.argv = ["node", "run.ts", "--mode", "execute"];
  process.env.STARKNET_SIGNER_MODE = "direct";
  process.env.STARKNET_RPC_URL = "https://starknet-sepolia-rpc.publicnode.com";
  process.env.STARKNET_ACCOUNT_ADDRESS = "0x123";
  process.env.DEMO_MCP_ENTRY = path.resolve("README.md");
  delete process.env.STARKNET_PRIVATE_KEY;

  const args = parseCliArgs();
  assert.throws(() => loadRunConfig(args), /Missing required env var: STARKNET_PRIVATE_KEY/);
});

test.after(() => {
  restoreProcessState();
});
