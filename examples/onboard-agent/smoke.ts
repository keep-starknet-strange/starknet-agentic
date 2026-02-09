import assert from "node:assert/strict";
import { CallData, byteArray, ec } from "starknet";
import { deployAccount } from "./steps/deploy-account.js";
import { firstAction } from "./steps/first-action.js";
import { preflight } from "./steps/preflight.js";

async function testDeployAccountParsesFactoryEvent() {
  const factoryAddress =
    "0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e";

  let executeCalled = false;
  let capturedCall:
    | { contractAddress: string; entrypoint: string; calldata: string[] }
    | undefined;

  const deterministicPrivateKey = Uint8Array.from(new Array(32).fill(1));
  const originalRandomPrivateKey = ec.starkCurve.utils.randomPrivateKey;
  (ec.starkCurve.utils as { randomPrivateKey: () => Uint8Array }).randomPrivateKey =
    () => deterministicPrivateKey;

  const mockDeployerAccount = {
    execute: async (call: { contractAddress: string; entrypoint: string; calldata: string[] }) => {
      executeCalled = true;
      capturedCall = call;
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

  try {
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

    const expectedPublicKey = ec.starkCurve.getStarkKey(deterministicPrivateKey);
    assert.equal(result.publicKey.toLowerCase(), expectedPublicKey.toLowerCase());

    const derivedFromReturnedPrivateKey = ec.starkCurve.getStarkKey(result.privateKey);
    assert.equal(
      derivedFromReturnedPrivateKey.toLowerCase(),
      result.publicKey.toLowerCase(),
    );

    const expectedCalldata = CallData.compile({
      public_key: expectedPublicKey,
      salt: "0x1234",
      token_uri: byteArray.byteArrayFromString("https://example.com/agent.json"),
    });
    assert.deepEqual(capturedCall?.calldata, expectedCalldata);
  } finally {
    (ec.starkCurve.utils as { randomPrivateKey: () => Uint8Array }).randomPrivateKey =
      originalRandomPrivateKey;
  }
}

async function testDeployAccountNoEventFallback() {
  const mockDeployerAccount = {
    execute: async () => ({ transaction_hash: "0xdef" }),
  };
  const mockProvider = {
    waitForTransaction: async () => ({ events: [] }),
  };

  const result = await deployAccount({
    provider: mockProvider as never,
    deployerAccount: mockDeployerAccount as never,
    networkConfig: {
      factory:
        "0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e",
      registry:
        "0x7856876f4c8e1880bc0a2e4c15f4de3085bc2bad5c7b0ae472740f8f558e417",
      rpc: "https://starknet-sepolia-rpc.publicnode.com",
      explorer: "https://sepolia.voyager.online",
    },
    tokenUri: "https://example.com/agent.json",
    salt: "0x1234",
  });

  assert.equal(result.accountAddress, "check_explorer");
}

async function testFirstActionBalanceReadOnlyFlow() {
  const expectedTokens = new Set([
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ]);

  const mockProvider = {
    callContract: async (call: {
      contractAddress: string;
      entrypoint: string;
      calldata: string[];
    }) => {
      assert.equal(call.entrypoint, "balance_of");
      assert.equal(call.calldata.length, 1);
      assert.ok(expectedTokens.has(call.contractAddress.toLowerCase()));
      return ["0xde0b6b3a7640000", "0x0"]; // 1e18
    },
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
  await testDeployAccountNoEventFallback();
  await testFirstActionBalanceReadOnlyFlow();
  await testPreflightRejectsUnknownNetwork();
  console.log("onboard-agent smoke: all checks passed");
}

main().catch((error) => {
  console.error("onboard-agent smoke failed");
  console.error(error);
  process.exit(1);
});
