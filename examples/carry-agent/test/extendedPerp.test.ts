import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ExtendedPythonPerpExecutor } from "../src/extendedPerp.js";

describe("ExtendedPythonPerpExecutor", () => {
  it("maps successful place_short response to execution order result", async () => {
    const calls: Array<{
      command: string;
      args: string[];
      env: Record<string, string | undefined>;
      stdinJson: Record<string, unknown>;
      timeoutMs: number;
    }> = [];

    const executor = new ExtendedPythonPerpExecutor(
      {
        pythonBin: "python3",
        scriptPath: "/tmp/adapter.py",
        baseUrl: "https://api.starknet.sepolia.extended.exchange",
        apiPrefix: "/api/v1",
        apiKey: "api-key",
        publicKey: "0x123",
        privateKey: "0x456",
        vaultNumber: 1234,
        slippageBps: 25,
        pollIntervalMs: 100,
        pollTimeoutMs: 5000,
        commandTimeoutMs: 7000,
      },
      async (input) => {
        calls.push(input);
        return {
          stdout: `${JSON.stringify({
            ok: true,
            action: "place_short",
            orderId: 77,
            externalOrderId: "ext-77",
            status: "FILLED",
            qty: 0.5,
            filledQty: 0.5,
            price: 2000,
            averagePrice: 1999.2,
            filledNotionalUsd: 999.6,
          })}\n`,
          stderr: "",
        };
      },
    );

    const result = await executor.placePerpShort({
      market: "ETH-USD",
      notionalUsd: 1000,
      markPrice: 2000,
    });

    assert.equal(result.orderId, "ext-77");
    assert.equal(result.filledNotionalUsd, 999.6);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.command, "python3");
    assert.deepEqual(calls[0]?.args, ["/tmp/adapter.py", "place_short"]);
    assert.equal(calls[0]?.env.EXTENDED_API_KEY, "api-key");
    assert.equal(calls[0]?.env.EXTENDED_VAULT_NUMBER, "1234");
    assert.equal(calls[0]?.stdinJson.market, "ETH-USD");
    assert.equal(calls[0]?.stdinJson.slippageBps, 25);
  });

  it("throws when adapter returns structured error payload", async () => {
    const executor = new ExtendedPythonPerpExecutor(
      {
        pythonBin: "python3",
        scriptPath: "/tmp/adapter.py",
        baseUrl: "https://api.starknet.extended.exchange",
        apiPrefix: "/api/v1",
        apiKey: "api-key",
        publicKey: "0x123",
        privateKey: "0x456",
        vaultNumber: 1234,
        slippageBps: 20,
        pollIntervalMs: 100,
        pollTimeoutMs: 5000,
        commandTimeoutMs: 7000,
      },
      async () => ({
        stdout: `${JSON.stringify({
          ok: false,
          action: "place_short",
          error: "not enough funds",
        })}\n`,
        stderr: "",
      }),
    );

    await assert.rejects(
      executor.placePerpShort({
        market: "ETH-USD",
        notionalUsd: 1000,
        markPrice: 2000,
      }),
      /not enough funds/,
    );
  });

  it("supports dead-man switch and mass-cancel actions", async () => {
    const seenActions: string[] = [];
    const executor = new ExtendedPythonPerpExecutor(
      {
        pythonBin: "python3",
        scriptPath: "/tmp/adapter.py",
        baseUrl: "https://api.starknet.extended.exchange",
        apiPrefix: "/api/v1",
        apiKey: "api-key",
        publicKey: "0x123",
        privateKey: "0x456",
        vaultNumber: 1234,
        slippageBps: 20,
        pollIntervalMs: 100,
        pollTimeoutMs: 5000,
        commandTimeoutMs: 7000,
      },
      async (input) => {
        seenActions.push(input.args[1] ?? "");
        return {
          stdout: `${JSON.stringify({ ok: true, action: input.args[1] })}\n`,
          stderr: "",
        };
      },
    );

    await executor.armDeadmanSwitch(45);
    await executor.cancelAllOpenOrders();

    assert.deepEqual(seenActions, ["arm_deadman_switch", "cancel_all"]);
  });
});
