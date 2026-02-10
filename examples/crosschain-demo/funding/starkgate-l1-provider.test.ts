import { describe, expect, it } from "vitest";
import { createStarkgateL1FundingProvider } from "./starkgate-l1-provider.js";

function createRuntime(args?: {
  l1BalanceWei?: bigint;
  txHash?: string;
  sleepStepMs?: number;
}) {
  let nowMs = 0;
  let depositCalls: Array<{ amount: bigint; recipient: bigint; value: bigint }> = [];
  const l1BalanceWei = args?.l1BalanceWei ?? 10n ** 18n;
  const txHash = args?.txHash ?? "0xabc";
  const sleepStepMs = args?.sleepStepMs ?? 1000;

  const runtime = {
    createL1Provider() {
      return {
        async getBalance() {
          return l1BalanceWei;
        },
      };
    },
    createL1Wallet() {
      return { address: "0xwallet" };
    },
    createL1Bridge() {
      return {
        async deposit(amount: bigint, l2Recipient: bigint, overrides: { value: bigint }) {
          depositCalls.push({
            amount,
            recipient: l2Recipient,
            value: overrides.value,
          });
          return {
            hash: txHash,
            async wait() {
              return {};
            },
          };
        },
      };
    },
    now() {
      return nowMs;
    },
    async sleep(_ms: number) {
      nowMs += sleepStepMs;
    },
  };

  return { runtime, getDepositCalls: () => depositCalls, getNowMs: () => nowMs };
}

describe("starkgateL1FundingProvider", () => {
  it("fails preflight when L1 config is missing", async () => {
    const { runtime } = createRuntime();
    const provider = createStarkgateL1FundingProvider(runtime);
    await expect(provider.preflight({ minDeployerBalanceWei: 1n })).rejects.toThrow("L1_RPC_URL is required");
  });

  it("fails when L1 wallet balance is insufficient", async () => {
    const { runtime } = createRuntime({ l1BalanceWei: 100n });
    const provider = createStarkgateL1FundingProvider(runtime);
    await provider.preflight({
      minDeployerBalanceWei: 1000n,
      l1RpcUrl: "https://l1.example",
      l1PrivateKey: "0xkey",
      l1GasBufferWei: 100n,
    });

    await expect(
      provider.fund({
        targetAddress: "0x123",
        amountWei: 50n,
        token: "ETH",
        network: "sepolia",
        requiredBalanceWei: 1000n,
        async readTargetBalanceWei() {
          return 0n;
        },
      }),
    ).rejects.toThrow("Insufficient L1 balance");
  });

  it("deposits on L1 and returns confirmed once L2 threshold is reached", async () => {
    const { runtime, getDepositCalls } = createRuntime({ l1BalanceWei: 10n ** 18n, txHash: "0xfeed" });
    const provider = createStarkgateL1FundingProvider(runtime);
    await provider.preflight({
      minDeployerBalanceWei: 100n,
      l1RpcUrl: "https://l1.example",
      l1PrivateKey: "0xkey",
      fundingTimeoutMs: 30000,
      fundingPollIntervalMs: 1000,
      l1GasBufferWei: 0n,
    });

    const balances = [40n, 70n, 120n];
    const result = await provider.fund({
      targetAddress: "0x123",
      amountWei: 60n,
      token: "ETH",
      network: "sepolia",
      requiredBalanceWei: 100n,
      async readTargetBalanceWei() {
        return balances.shift() ?? 120n;
      },
    });

    expect(getDepositCalls()).toEqual([{ amount: 60n, recipient: 0x123n, value: 60n }]);
    expect(result.status).toBe("confirmed");
    expect(result.provider).toBe("starkgate-l1");
    expect(result.source_chain).toBe("ethereum-sepolia");
    expect(result.source_tx_hash).toBe("0xfeed");
    expect(result.amount_wei).toBe("60");
    expect(result.token).toBe("ETH");
  });

  it("times out when L2 balance does not reach threshold", async () => {
    const { runtime, getNowMs } = createRuntime({ l1BalanceWei: 10n ** 18n, txHash: "0xdead", sleepStepMs: 1000 });
    const provider = createStarkgateL1FundingProvider(runtime);
    await provider.preflight({
      minDeployerBalanceWei: 100n,
      l1RpcUrl: "https://l1.example",
      l1PrivateKey: "0xkey",
      fundingTimeoutMs: 2500,
      fundingPollIntervalMs: 1000,
      l1GasBufferWei: 0n,
    });

    await expect(
      provider.fund({
        targetAddress: "0x123",
        amountWei: 60n,
        token: "ETH",
        network: "sepolia",
        requiredBalanceWei: 100n,
        async readTargetBalanceWei() {
          return 10n;
        },
      }),
    ).rejects.toThrow("L1 tx hash: 0xdead");

    expect(getNowMs()).toBeGreaterThanOrEqual(2000);
  });
});
