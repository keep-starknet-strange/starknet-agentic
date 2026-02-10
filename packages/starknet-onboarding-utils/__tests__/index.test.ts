import { describe, expect, it } from "vitest";
import { CallData, byteArray, ec } from "starknet";
import {
  deployAccountViaFactory,
  formatBalance,
  parseFactoryAccountDeployedEvent,
} from "../src/index.js";

describe("@starknet-agentic/onboarding-utils", () => {
  describe("formatBalance", () => {
    it("formats 0", () => {
      expect(formatBalance(0n, 18)).toBe("0");
    });

    it("formats small values under decimals", () => {
      expect(formatBalance(1n, 18)).toBe("0.000000000000000001");
      expect(formatBalance(10n ** 17n, 18)).toBe("0.1");
    });

    it("formats whole numbers", () => {
      expect(formatBalance(10n ** 18n, 18)).toBe("1");
      expect(formatBalance(42n * 10n ** 18n, 18)).toBe("42");
    });

    it("trims trailing zeros", () => {
      expect(formatBalance(1234500000000000000n, 18)).toBe("1.2345");
    });
  });

  describe("parseFactoryAccountDeployedEvent", () => {
    it("returns nulls when receipt has no events", () => {
      expect(
        parseFactoryAccountDeployedEvent({ factoryAddress: "0x1", receipt: {} }),
      ).toEqual({ accountAddress: null, agentId: null });
    });

    it("parses the deployed account + u256 agent id", () => {
      const receipt = {
        events: [
          {
            from_address: "0xFactory",
            data: ["0xacc", "0xpub", "0x2", "0x0", "0xreg"],
          },
        ],
      };
      const parsed = parseFactoryAccountDeployedEvent({
        factoryAddress: "0xfactory",
        receipt,
      });
      expect(parsed.accountAddress).toBe("0xacc");
      expect(parsed.agentId).toBe("2");
    });
  });

  describe("deployAccountViaFactory", () => {
    it("calls account.execute in non-gasfree mode and parses event", async () => {
      const factoryAddress = "0x3583";
      let executeCalls: unknown[] = [];

      const deterministicPrivateKey = Uint8Array.from(new Array(32).fill(1));
      const originalRandomPrivateKey = ec.starkCurve.utils.randomPrivateKey;
      (ec.starkCurve.utils as { randomPrivateKey: () => Uint8Array }).randomPrivateKey =
        () => deterministicPrivateKey;

      try {
        const res = await deployAccountViaFactory({
          factoryAddress,
          tokenUri: "https://example.com/agent.json",
          salt: "0x1234",
          requireEvent: true,
          gasfree: false,
          deployerAccount: {
            async execute(calls) {
              executeCalls.push(calls);
              return { transaction_hash: "0xabc" };
            },
            async executePaymasterTransaction() {
              throw new Error("should not be called");
            },
          },
          provider: {
            async waitForTransaction() {
              return {
                events: [
                  {
                    from_address: factoryAddress,
                    data: ["0xacc", "0xpub", "0x2", "0x0", "0xreg"],
                  },
                ],
              };
            },
            async callContract() {
              throw new Error("not used");
            },
            async getChainId() {
              throw new Error("not used");
            },
          },
        });

        expect(res.accountAddress).toBe("0xacc");
        expect(res.agentId).toBe("2");
        expect(res.deployTxHash).toBe("0xabc");

        // Validate calldata shape is stable for known salt + tokenUri.
        const expectedPublicKey = ec.starkCurve.getStarkKey(deterministicPrivateKey);
        const expectedCalldata = CallData.compile({
          public_key: expectedPublicKey,
          salt: "0x1234",
          token_uri: byteArray.byteArrayFromString("https://example.com/agent.json"),
        });

        const firstCall = executeCalls[0] as { contractAddress: string; entrypoint: string; calldata: string[] };
        expect(firstCall.entrypoint).toBe("deploy_account");
        expect(firstCall.contractAddress).toBe(factoryAddress);
        expect(firstCall.calldata).toEqual(expectedCalldata);
      } finally {
        (ec.starkCurve.utils as { randomPrivateKey: () => Uint8Array }).randomPrivateKey =
          originalRandomPrivateKey;
      }
    });

    it("calls account.executePaymasterTransaction in gasfree mode", async () => {
      const factoryAddress = "0x3583";
      let paymasterDetails: unknown = null;

      const res = await deployAccountViaFactory({
        factoryAddress,
        tokenUri: "https://example.com/agent.json",
        salt: "0x1234",
        requireEvent: true,
        gasfree: true,
        deployerAccount: {
          async execute() {
            throw new Error("should not be called");
          },
          async executePaymasterTransaction(_calls, details) {
            paymasterDetails = details;
            return { transaction_hash: "0xgasfree" };
          },
        },
        provider: {
          async waitForTransaction() {
            return {
              events: [
                {
                  from_address: factoryAddress,
                  data: ["0xacc", "0xpub", "0x2", "0x0", "0xreg"],
                },
              ],
            };
          },
          async callContract() {
            throw new Error("not used");
          },
          async getChainId() {
            throw new Error("not used");
          },
        },
      });

      expect(res.deployTxHash).toBe("0xgasfree");
      expect((paymasterDetails as { feeMode?: { mode?: string } })?.feeMode?.mode).toBe("sponsored");
    });

    it("supports non-strict mode fallback when event is missing", async () => {
      const res = await deployAccountViaFactory({
        factoryAddress: "0x3583",
        tokenUri: "https://example.com/agent.json",
        salt: "0x1234",
        requireEvent: false,
        gasfree: false,
        deployerAccount: {
          async execute() {
            return { transaction_hash: "0xabc" };
          },
          async executePaymasterTransaction() {
            throw new Error("not used");
          },
        },
        provider: {
          async waitForTransaction() {
            return { events: [] };
          },
          async callContract() {
            throw new Error("not used");
          },
          async getChainId() {
            throw new Error("not used");
          },
        },
      });
      expect(res.accountAddress).toBe("check_explorer");
    });
  });
});

