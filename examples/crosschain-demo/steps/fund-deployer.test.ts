import { describe, expect, it } from "vitest";
import { fundDeployer } from "./fund-deployer.js";
import type { FundingProvider } from "../funding/types.js";

function u256Words(value: bigint): [string, string] {
  const lowMask = (1n << 128n) - 1n;
  const low = value & lowMask;
  const high = value >> 128n;
  return [low.toString(), high.toString()];
}

describe("fundDeployer", () => {
  it("skips funding when deployer balance is above threshold", async () => {
    const min = 100n;
    const [low, high] = u256Words(150n);
    const selected: string[] = [];

    const result = await fundDeployer({
      provider: {
        async callContract() {
          return [low, high];
        },
      },
      network: "sepolia",
      deployerAddress: "0x123",
      providerSelection: "auto",
      config: { minDeployerBalanceWei: min },
      resolveProvider(name) {
        selected.push(name);
        const provider: FundingProvider =
          name === "skipped"
            ? {
                name: "skipped",
                async preflight() {},
                async fund() {
                  return {
                    provider: "skipped",
                    status: "skipped",
                    source_chain: "none",
                    skipped_reason: "already_funded",
                  };
                },
              }
            : {
                name: "mock",
                async preflight() {},
                async fund() {
                  throw new Error("mock should not run in this test");
                },
              };
        return provider;
      },
    });

    expect(selected).toEqual(["skipped"]);
    expect(result.funding.status).toBe("skipped");
    expect(result.funding.skipped_reason).toBe("already_funded");
  });

  it("uses mock provider when balance is below threshold and provider=mock", async () => {
    const min = 100n;
    const [low, high] = u256Words(40n);
    const selected: string[] = [];

    const result = await fundDeployer({
      provider: {
        async callContract() {
          return [low, high];
        },
      },
      network: "sepolia",
      deployerAddress: "0x123",
      providerSelection: "mock",
      config: { minDeployerBalanceWei: min },
      resolveProvider(name) {
        selected.push(name);
        const provider: FundingProvider =
          name === "mock"
            ? {
                name: "mock",
                async preflight() {},
                async fund(params) {
                  return {
                    provider: "mock",
                    status: "mock",
                    source_chain: "none",
                    amount_wei: params.amountWei.toString(),
                    token: params.token,
                  };
                },
              }
            : {
                name: "skipped",
                async preflight() {},
                async fund() {
                  throw new Error("skipped should not run in this test");
                },
              };
        return provider;
      },
    });

    expect(selected).toEqual(["mock"]);
    expect(result.funding.status).toBe("mock");
    expect(result.funding.amount_wei).toBe("60");
  });

  it("fails closed when balance is below threshold and provider=auto", async () => {
    const [low, high] = u256Words(10n);

    await expect(
      fundDeployer({
        provider: {
          async callContract() {
            return [low, high];
          },
        },
        network: "sepolia",
        deployerAddress: "0x123",
        providerSelection: "auto",
        config: { minDeployerBalanceWei: 100n },
      }),
    ).rejects.toThrow("no real funding provider is configured in PR1 scaffolding");
  });

  it("rejects forced skipped provider when deployer is under threshold", async () => {
    const [low, high] = u256Words(10n);

    await expect(
      fundDeployer({
        provider: {
          async callContract() {
            return [low, high];
          },
        },
        network: "sepolia",
        deployerAddress: "0x123",
        providerSelection: "skipped",
        config: { minDeployerBalanceWei: 100n },
      }),
    ).rejects.toThrow("FUNDING_PROVIDER=skipped");
  });
});
