import assert from "node:assert/strict";
import { deployAccount } from "./steps/deploy-account.js";
import { firstAction } from "./steps/first-action.js";
import { preflight } from "./steps/preflight.js";

async function testDeployAccountParsesFactoryEvent() {
  const factoryAddress =
    "0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e";

  let executeCalled = false;

  const mockDeployerAccount = {
    execute: async (call: { contractAddress: string; entrypoint: string; calldata: string[] }) => {
      executeCalled = true;
      assert.equal(call.contractAddress.toLowerCase(), factoryAddress.toLowerCase());
      assert.equal(call.entrypoint, "deploy_account");
      assert.ok(call.calldata.length > 0);
      return { transaction_hash: "0xabc" };
    },
  };

  const mockProvider = {
    waitForTransaction: async (txHash: string) => {
      assert.equal(txHash, "0xabc");
      return {
        events: [
          {
            from_address: factoryAddress,
            data: ["0xacc", "0xpub", "0x2", "0x0", "0xreg"],
          },
        ],
      };
    },
  };

  const result = await deployAccount({
    provider: mockProvider as never,
    deployerAccount: mockDeployerAccount as never,
    networkConfig: {
      factory: factoryAddress,
      registry:
        "0x7856876f4c8e1880bc0a2e4c15f4de3085bc2bad5c7b0ae472740f8f558e417",
      rpc: "https://starknet-sepolia-rpc.publicnode.com",
      explorer: "https://sepolia.voyager.online",
    },
    tokenUri: "https://example.com/agent.json",
    salt: "0x1234",
  });

  assert.equal(executeCalled, true);
  assert.equal(result.accountAddress, "0xacc");
  assert.equal(result.agentId, "2");
  assert.equal(result.deployTxHash, "0xabc");
  assert.ok(result.publicKey.startsWith("0x"));
  assert.ok(result.privateKey.startsWith("0x"));
}

async function testFirstActionBalanceReadOnlyFlow() {
  const mockProvider = {
    callContract: async () => ["0xde0b6b3a7640000", "0x0"], // 1e18
  };

  const result = await firstAction({
    provider: mockProvider as never,
    accountAddress:
      "0x6c876f3f05e44fbe836a577c32c05640e4e3c4745c6cdac35c2b64253370071",
    privateKey: "0x1",
    network: "sepolia",
    verifyTx: false,
  });

  assert.equal(result.verifyTxHash, null);
  assert.equal(result.balances.ETH, "1");
  assert.equal(result.balances.STRK, "1");
}

async function testPreflightRejectsUnknownNetwork() {
  await assert.rejects(
    preflight({
      network: "invalid-network",
      accountAddress:
        "0x6c876f3f05e44fbe836a577c32c05640e4e3c4745c6cdac35c2b64253370071",
      privateKey: "0x1",
    }),
    /Unknown network/,
  );
}

async function main() {
  await testDeployAccountParsesFactoryEvent();
  await testFirstActionBalanceReadOnlyFlow();
  await testPreflightRejectsUnknownNetwork();
  console.log("onboard-agent smoke: all checks passed");
}

main().catch((error) => {
  console.error("onboard-agent smoke failed");
  console.error(error);
  process.exit(1);
});
