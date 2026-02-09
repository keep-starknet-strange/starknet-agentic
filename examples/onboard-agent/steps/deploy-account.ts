/**
 * Deploy a new agent account via the AgentAccountFactory.
 *
 * This step:
 * 1. Generates a new Stark keypair locally (never sent to any server)
 * 2. Calls factory.deploy_account(public_key, salt, token_uri)
 * 3. Returns the new account address, agent_id, and keypair
 *
 * The factory atomically:
 *   - Deploys an AgentAccount contract
 *   - Registers the agent with the IdentityRegistry (ERC-8004)
 *   - Transfers the identity NFT to the new account
 *   - Links the agent_id to the account
 */

import {
  ec,
  CallData,
  byteArray,
  PaymasterRpc,
  type RpcProvider,
  type Account,
  encode,
} from "starknet";
import type { NetworkConfig } from "../config.js";

export interface DeployAccountResult {
  accountAddress: string;
  agentId: string;
  publicKey: string;
  privateKey: string;
  deployTxHash: string;
}

export async function deployAccount(args: {
  provider: RpcProvider;
  deployerAccount: Account;
  networkConfig: NetworkConfig;
  network: string;
  tokenUri: string;
  gasfree?: boolean;
  paymasterUrl?: string;
  paymasterApiKey?: string;
  salt?: string;
}): Promise<DeployAccountResult> {
  const {
    provider,
    deployerAccount,
    networkConfig,
    network,
    tokenUri,
    gasfree = false,
    paymasterUrl,
    paymasterApiKey,
  } = args;

  // --- Generate keypair locally ---
  const privateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
  const privateKey = "0x" + encode.buf2hex(privateKeyBytes);
  const publicKey = ec.starkCurve.getStarkKey(privateKeyBytes);

  console.log(`  New agent public key: ${publicKey}`);
  console.log(`  Token URI: ${tokenUri}`);

  // --- Salt ---
  const salt =
    args.salt || "0x" + encode.buf2hex(ec.starkCurve.utils.randomPrivateKey());
  console.log(`  Salt: ${salt}`);

  console.log(`  Calling factory.deploy_account()...`);

  const calldata = CallData.compile({
    public_key: publicKey,
    salt,
    token_uri: byteArray.byteArrayFromString(tokenUri),
  });

  const deployCall = {
    contractAddress: networkConfig.factory,
    entrypoint: "deploy_account",
    calldata,
  };

  let result: { transaction_hash: string };
  if (!gasfree) {
    result = await deployerAccount.execute(deployCall);
  } else {
    const effectivePaymasterUrl =
      paymasterUrl ||
      (network === "sepolia"
        ? "https://sepolia.paymaster.avnu.fi"
        : "https://starknet.paymaster.avnu.fi");
    const apiKey = paymasterApiKey;
    if (!apiKey) {
      throw new Error(
        "Gasfree mode requires AVNU_PAYMASTER_API_KEY in environment."
      );
    }
    const paymaster = new PaymasterRpc({
      nodeUrl: effectivePaymasterUrl,
      headers: { "x-paymaster-api-key": apiKey },
    });

    result = await deployerAccount.execute([deployCall], {
      paymaster: {
        provider: paymaster,
        params: {
          version: "0x1",
          feeMode: { mode: "sponsored" },
        },
      },
    } as never);
  }

  console.log(`  Waiting for tx: ${result.transaction_hash}...`);
  const receipt = await provider.waitForTransaction(result.transaction_hash);

  // --- Parse AccountDeployed event to get account address + agent_id ---
  let accountAddress = "";
  let agentId = "";

  // Receipt is a union type; successful receipts have events
  const events = (receipt as { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> }).events;

  if (events && events.length > 0) {
    // The AccountDeployed event has: account, public_key, agent_id (u256 = low + high), registry
    // It's typically the last event emitted by the factory
    for (const event of events) {
      // AccountDeployed fields in data:
      // [account, public_key, agent_id.low, agent_id.high, registry]
      if (
        event.from_address?.toLowerCase() === networkConfig.factory.toLowerCase() &&
        event.data &&
        event.data.length >= 4
      ) {
        accountAddress = event.data[0];
        const low = BigInt(event.data[2]);
        const high = BigInt(event.data[3]);
        agentId = (low + (high << 128n)).toString();
        break;
      }
    }
  }

  if (!accountAddress) {
    // Fallback: if we couldn't parse the event, the tx succeeded but we need
    // the user to check the explorer
    console.log(
      "  WARNING: Could not parse AccountDeployed event. Check the tx on explorer."
    );
    accountAddress = "check_explorer";
  }

  console.log(`  Account deployed: ${accountAddress}`);
  console.log(`  Agent ID: ${agentId}`);

  return {
    accountAddress,
    agentId,
    publicKey,
    privateKey,
    deployTxHash: result.transaction_hash,
  };
}
