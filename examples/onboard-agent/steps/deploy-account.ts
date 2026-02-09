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
  Contract,
  type RpcProvider,
  type Account,
  encode,
} from "starknet";
import type { NetworkConfig } from "../config.js";

// Minimal ABI for AgentAccountFactory.deploy_account
const FACTORY_ABI = [
  {
    type: "interface",
    name: "agent_account::interfaces::IAgentAccountFactory",
    items: [
      {
        type: "function",
        name: "deploy_account",
        inputs: [
          { name: "public_key", type: "core::felt252" },
          { name: "salt", type: "core::felt252" },
          {
            name: "token_uri",
            type: "core::byte_array::ByteArray",
          },
        ],
        outputs: [
          {
            type: "(core::starknet::contract_address::ContractAddress, core::integer::u256)",
          },
        ],
        state_mutability: "external",
      },
    ],
  },
];

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
  tokenUri: string;
  salt?: string;
}): Promise<DeployAccountResult> {
  const { provider, deployerAccount, networkConfig, tokenUri } = args;

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

  // --- Call factory ---
  const factory = new Contract({
    abi: FACTORY_ABI,
    address: networkConfig.factory,
    providerOrAccount: deployerAccount,
  });

  console.log(`  Calling factory.deploy_account()...`);

  const result = await factory.invoke("deploy_account", [
    publicKey,
    salt,
    tokenUri,
  ]);

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
      // AccountDeployed event has 4 keys (selector + account + public_key) and data (agent_id_low, agent_id_high, registry)
      // We look for an event from the factory address
      if (
        event.from_address?.toLowerCase() ===
        networkConfig.factory.toLowerCase()
      ) {
        // In Starknet events: keys[0] = selector, keys[1..] = indexed params
        // data = non-indexed params
        if (event.keys && event.keys.length >= 2) {
          accountAddress = event.keys[1]; // account address (first indexed param after selector)
        }
        if (event.data && event.data.length >= 2) {
          // agent_id is u256 = (low, high)
          const low = BigInt(event.data[0]);
          const high = BigInt(event.data[1]);
          agentId = (low + (high << 128n)).toString();
        }
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
