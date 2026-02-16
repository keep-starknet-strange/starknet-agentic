#!/usr/bin/env npx tsx
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Account,
  CallData,
  ETransactionVersion,
  PaymasterRpc,
  type RpcProvider,
  byteArray,
  cairo,
} from "starknet";
import { Contract, Interface, JsonRpcProvider, Wallet, ZeroAddress } from "ethers";
import { waitForTransactionWithTimeout } from "@starknet-agentic/onboarding-utils";
import { preflight } from "./steps/preflight.js";
import { deployAccount } from "./steps/deploy-account.js";
import { fundDeployer } from "./steps/fund-deployer.js";
import { firstAction } from "./steps/first-action.js";
import { EVM_NETWORKS, PLACEHOLDER_URI, STARKNET_NAMESPACE } from "./config.js";
import type { FundingProviderSelection } from "./funding/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const EVM_IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
] as const;

interface Args {
  starknetNetwork: string;
  evmNetwork: string;
  name: string;
  description: string;
  verifyTx: boolean;
  gasfree: boolean;
  salt?: string;
  sharedUri?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = {
    starknetNetwork: "sepolia",
    evmNetwork: "base-sepolia",
    name: "Starknet Agentic Demo Agent",
    description: "Cross-chain ERC-8004 identity demo (EVM <-> Starknet)",
    verifyTx: false,
    gasfree: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--starknet-network":
        parsed.starknetNetwork = args[++i];
        break;
      case "--evm-network":
        parsed.evmNetwork = args[++i];
        break;
      case "--name":
        parsed.name = args[++i];
        break;
      case "--description":
        parsed.description = args[++i];
        break;
      case "--verify-tx":
        parsed.verifyTx = true;
        break;
      case "--gasfree":
        parsed.gasfree = true;
        break;
      case "--salt":
        parsed.salt = args[++i];
        break;
      case "--shared-uri":
        parsed.sharedUri = args[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${args[i]}`);
    }
  }

  return parsed;
}

export function createSharedUri(input: {
  name: string;
  description: string;
  evmAgentId: string;
  evmRegistry: string;
  evmChainId: number;
  starknetAgentId: string;
  starknetRegistry: string;
  starknetNetwork: string;
}): string {
  const starknetNamespace = STARKNET_NAMESPACE[input.starknetNetwork] || input.starknetNetwork;
  const payload = {
    type: "erc8004-agent-registration-v1",
    name: input.name,
    description: input.description,
    registrations: [
      {
        agentId: input.evmAgentId,
        agentRegistry: `eip155:${input.evmChainId}:${input.evmRegistry}`,
      },
      {
        agentId: input.starknetAgentId,
        agentRegistry: `starknet:${starknetNamespace}:${input.starknetRegistry}`,
      },
    ],
    generatedAt: new Date().toISOString(),
    generatedBy: "starknet-agentic/examples/crosschain-demo",
  };

  return `data:application/json;utf8,${encodeURIComponent(JSON.stringify(payload))}`;
}

export function extractMintedTokenId(
  receipt: { logs: Array<{ topics: string[]; data: string }> },
  iface: Interface,
): bigint | null {
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed || parsed.name !== "Transfer") {
        continue;
      }
      const from = String(parsed.args[0]);
      if (from.toLowerCase() !== ZeroAddress.toLowerCase()) {
        continue;
      }
      return BigInt(parsed.args[2].toString());
    } catch {
      // Ignore logs from other contracts
    }
  }
  return null;
}

export function resolveEvmAgentId(args: {
  predictedAgentId: bigint;
  receipt: { logs: Array<{ topics: string[]; data: string }> };
  iface: Interface;
}): bigint {
  return extractMintedTokenId(args.receipt, args.iface) ?? args.predictedAgentId;
}

function formatEthWei(wei: bigint): string {
  const base = 10n ** 18n;
  const whole = wei / base;
  const frac = wei % base;
  if (frac === 0n) {
    return `${whole.toString()}.0`;
  }
  const fracStr = frac.toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : `${whole.toString()}.0`;
}

export function parseFundingProvider(value: string | undefined): FundingProviderSelection {
  const parsed = (value || "auto").toLowerCase();
  if (parsed === "auto" || parsed === "mock" || parsed === "skipped" || parsed === "starkgate-l1") {
    return parsed;
  }
  throw new Error(`Invalid FUNDING_PROVIDER "${value}". Expected one of: auto, mock, skipped, starkgate-l1.`);
}

export function parseMinStarknetDeployerBalanceWei(value: string | undefined): bigint {
  return parseNonNegativeWei(value || "5000000000000000", "MIN_STARKNET_DEPLOYER_BALANCE_WEI");
}

export function parseNonNegativeWei(raw: string, varName: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(raw);
  } catch {
    throw new Error(`Invalid ${varName} "${raw}". Expected non-negative integer wei value.`);
  }
  if (parsed < 0n) {
    throw new Error(`${varName} must be non-negative.`);
  }
  return parsed;
}

export function parsePositiveIntEnv(value: string | undefined, varName: string, defaultValue: number): number {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${varName} "${value}". Expected positive integer.`);
  }
  return parsed;
}

async function updateStarknetUri(args: {
  provider: RpcProvider;
  accountAddress: string;
  privateKey: string;
  registry: string;
  agentId: string;
  uri: string;
  gasfree: boolean;
  network: string;
  paymasterApiKey?: string;
  paymasterUrl?: string;
}): Promise<string> {
  const paymasterUrl =
    args.paymasterUrl ||
    (args.network === "sepolia"
      ? "https://sepolia.paymaster.avnu.fi"
      : "https://starknet.paymaster.avnu.fi");

  const paymaster = new PaymasterRpc({
    nodeUrl: paymasterUrl,
    headers: args.paymasterApiKey
      ? {
          "x-paymaster-api-key": args.paymasterApiKey,
        }
      : {},
  });

  const account = new Account({
    provider: args.provider,
    address: args.accountAddress,
    signer: args.privateKey,
    transactionVersion: ETransactionVersion.V3,
    paymaster,
  });

  const call = {
    contractAddress: args.registry,
    entrypoint: "set_agent_uri",
    calldata: CallData.compile({
      agent_id: cairo.uint256(BigInt(args.agentId)),
      new_uri: byteArray.byteArrayFromString(args.uri),
    }),
  };

  if (!args.gasfree) {
    const tx = await account.execute(call);
    await waitForTransactionWithTimeout({
      provider: args.provider as any,
      txHash: tx.transaction_hash,
      timeoutMs: 300_000,
    });
    return tx.transaction_hash;
  }

  if (!args.paymasterApiKey) {
    throw new Error("--gasfree requires AVNU_PAYMASTER_API_KEY in .env");
  }
  const tx = await account.executePaymasterTransaction([call], {
    feeMode: { mode: "sponsored" },
  });

  await waitForTransactionWithTimeout({
    provider: args.provider as any,
    txHash: tx.transaction_hash,
    timeoutMs: 300_000,
  });
  return tx.transaction_hash;
}

async function main() {
  const args = parseArgs();
  const evmConfig = EVM_NETWORKS[args.evmNetwork];
  if (!evmConfig) {
    throw new Error(
      `Unknown EVM network "${args.evmNetwork}". Available: ${Object.keys(EVM_NETWORKS).join(", ")}`,
    );
  }

  const evmRpcUrl = process.env.EVM_RPC_URL || evmConfig.rpc;
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY;
  if (!evmPrivateKey) {
    throw new Error("EVM_PRIVATE_KEY is required in examples/crosschain-demo/.env");
  }

  const starknetDeployerAddress = process.env.DEPLOYER_ADDRESS;
  const starknetDeployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!starknetDeployerAddress || !starknetDeployerPrivateKey) {
    throw new Error("DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY are required in examples/crosschain-demo/.env");
  }

  const evmRegistry = process.env.EVM_IDENTITY_REGISTRY || evmConfig.identityRegistry;
  const minStarknetDeployerBalanceWei = parseMinStarknetDeployerBalanceWei(
    process.env.MIN_STARKNET_DEPLOYER_BALANCE_WEI,
  );
  const fundingProvider = parseFundingProvider(process.env.FUNDING_PROVIDER);
  const fundingTimeoutMs = parsePositiveIntEnv(process.env.FUNDING_TIMEOUT_MS, "FUNDING_TIMEOUT_MS", 900000);
  const fundingPollIntervalMs = parsePositiveIntEnv(
    process.env.FUNDING_POLL_INTERVAL_MS,
    "FUNDING_POLL_INTERVAL_MS",
    5000,
  );
  const l1GasBufferWei = parseNonNegativeWei(process.env.L1_GAS_BUFFER_WEI || "1000000000000000", "L1_GAS_BUFFER_WEI");

  console.log("=== ERC-8004 Cross-Chain Demo ===\n");
  console.log(`Starknet network: ${args.starknetNetwork}`);
  console.log(`EVM network:      ${args.evmNetwork}`);
  console.log(`EVM registry:     ${evmRegistry}`);
  console.log(`Gasfree:          ${args.gasfree}`);
  console.log(`Funding provider: ${fundingProvider}`);
  console.log("");

  // ---------- EVM preflight ----------
  console.log("[1/6] EVM preflight...");
  const evmProvider = new JsonRpcProvider(evmRpcUrl);
  const evmNetwork = await evmProvider.getNetwork();
  if (Number(evmNetwork.chainId) !== evmConfig.chainId) {
    throw new Error(
      `EVM chain mismatch: expected ${evmConfig.chainId}, got ${evmNetwork.chainId.toString()}`,
    );
  }

  const code = await evmProvider.getCode(evmRegistry);
  if (code === "0x") {
    throw new Error(`No code at EVM identity registry ${evmRegistry}`);
  }

  const evmWallet = new Wallet(evmPrivateKey, evmProvider);
  const evmIdentity = new Contract(evmRegistry, EVM_IDENTITY_ABI, evmWallet);
  console.log(`  EVM signer: ${evmWallet.address}`);

  const minEvmBalanceWei = BigInt(process.env.MIN_EVM_BALANCE_WEI || "300000000000000");
  const evmBalanceWei = await evmProvider.getBalance(evmWallet.address);
  if (evmBalanceWei < minEvmBalanceWei) {
    throw new Error(
      `Insufficient EVM gas balance for ${evmWallet.address}: ` +
        `${formatEthWei(evmBalanceWei)} ETH < required ${formatEthWei(minEvmBalanceWei)} ETH. ` +
        "Fund the Base Sepolia wallet before running cross-chain demo.",
    );
  }
  console.log(`  EVM balance: ${formatEthWei(evmBalanceWei)} ETH`);

  // ---------- Starknet preflight ----------
  console.log("[2/6] Starknet preflight...");
  const starknetPreflight = await preflight({
    network: args.starknetNetwork,
    rpcUrl: process.env.STARKNET_RPC_URL,
    accountAddress: starknetDeployerAddress,
    privateKey: starknetDeployerPrivateKey,
    paymasterUrl: process.env.AVNU_PAYMASTER_URL,
    paymasterApiKey: process.env.AVNU_PAYMASTER_API_KEY,
  });
  console.log("  Starknet preflight passed");

  // ---------- Funding pre-step ----------
  console.log("[3/7] Funding pre-step...");
  const fundingStage = await fundDeployer({
    provider: starknetPreflight.provider,
    network: args.starknetNetwork,
    deployerAddress: starknetDeployerAddress,
    providerSelection: fundingProvider,
    config: {
      minDeployerBalanceWei: minStarknetDeployerBalanceWei,
      l1RpcUrl: process.env.L1_RPC_URL,
      l1PrivateKey: process.env.L1_PRIVATE_KEY,
      starkgateEthBridgeAddress: process.env.STARKGATE_ETH_BRIDGE_L1,
      fundingTimeoutMs,
      fundingPollIntervalMs,
      l1GasBufferWei,
    },
  });
  console.log(
    `  Funding status: ${fundingStage.funding.status} (provider=${fundingStage.funding.provider}, deployer_balance=${formatEthWei(
      fundingStage.balanceWei,
    )} ETH)`,
  );

  // ---------- EVM register ----------
  console.log("[4/7] Registering EVM identity...");
  const predictedEvmAgentId: bigint = await evmIdentity.register.staticCall(PLACEHOLDER_URI);
  const registerTx = await evmIdentity.register(PLACEHOLDER_URI);
  const registerReceipt = await registerTx.wait();
  if (!registerReceipt) {
    throw new Error("No receipt returned for EVM register tx");
  }
  const evmAgentId = resolveEvmAgentId({
    predictedAgentId: predictedEvmAgentId,
    receipt: registerReceipt as { logs: Array<{ topics: string[]; data: string }> },
    iface: evmIdentity.interface,
  });

  console.log(`  EVM agentId: ${evmAgentId.toString()}`);
  console.log(`  EVM register tx: ${registerTx.hash}`);

  // ---------- Predict Starknet next agent id ----------
  const totalAgentsResult = await starknetPreflight.provider.callContract({
    contractAddress: starknetPreflight.networkConfig.registry,
    entrypoint: "total_agents",
    calldata: [],
  });
  const totalLow = BigInt(totalAgentsResult[0] || "0");
  const totalHigh = BigInt(totalAgentsResult[1] || "0");
  const currentTotalAgents = totalLow + (totalHigh << 128n);
  const predictedStarknetAgentId = (currentTotalAgents + 1n).toString();

  // ---------- Link via shared URI ----------
  console.log("[5/7] Deploying Starknet account with shared URI...");
  const sharedUri =
    args.sharedUri ||
    createSharedUri({
      name: args.name,
      description: args.description,
      evmAgentId: evmAgentId.toString(),
      evmRegistry,
      evmChainId: evmConfig.chainId,
      starknetAgentId: predictedStarknetAgentId,
      starknetRegistry: starknetPreflight.networkConfig.registry,
      starknetNetwork: args.starknetNetwork,
    });

  const starknetDeploy = await deployAccount({
    provider: starknetPreflight.provider,
    deployerAccount: starknetPreflight.account,
    networkConfig: starknetPreflight.networkConfig,
    network: args.starknetNetwork,
    tokenUri: sharedUri,
    gasfree: args.gasfree,
    paymasterUrl: process.env.AVNU_PAYMASTER_URL,
    paymasterApiKey: process.env.AVNU_PAYMASTER_API_KEY,
    salt: args.salt,
  });
  console.log(`  Starknet account: ${starknetDeploy.accountAddress}`);
  console.log(`  Starknet agentId: ${starknetDeploy.agentId}`);

  if (starknetDeploy.agentId !== predictedStarknetAgentId) {
    throw new Error(
      `Predicted Starknet agent_id ${predictedStarknetAgentId} but deployed ${starknetDeploy.agentId}. ` +
        "Re-run the flow (likely concurrent registration changed ordering).",
    );
  }

  console.log("[6/7] Updating shared registration URI on EVM...");

  const evmSetUriTx = await evmIdentity.setAgentURI(evmAgentId, sharedUri);
  const evmSetUriReceipt = await evmSetUriTx.wait();
  if (!evmSetUriReceipt) {
    throw new Error("No receipt returned for EVM setAgentURI tx");
  }

  // ---------- First action ----------
  console.log("[7/7] Verifying Starknet account operations...");
  const action = await firstAction({
    provider: starknetPreflight.provider,
    accountAddress: starknetDeploy.accountAddress,
    privateKey: starknetDeploy.privateKey,
    network: args.starknetNetwork,
    verifyTx: args.verifyTx,
  });

  const receipt = {
    version: "2",
    generated_at: new Date().toISOString(),
    funding: fundingStage.funding,
    starknet: {
      network: args.starknetNetwork,
      chain_id: starknetPreflight.chainId,
      identity_registry: starknetPreflight.networkConfig.registry,
      factory: starknetPreflight.networkConfig.factory,
      account_address: starknetDeploy.accountAddress,
      agent_id: starknetDeploy.agentId,
      deploy_tx_hash: starknetDeploy.deployTxHash,
      set_agent_uri_tx_hash: null,
      first_action_tx_hash: action.verifyTxHash,
      balances: action.balances,
    },
    evm: {
      network: args.evmNetwork,
      chain_id: evmConfig.chainId,
      identity_registry: evmRegistry,
      agent_id: evmAgentId.toString(),
      register_tx_hash: registerTx.hash,
      set_agent_uri_tx_hash: evmSetUriTx.hash,
      signer: evmWallet.address,
    },
    shared_uri: sharedUri,
  };

  const receiptPath = path.join(__dirname, "crosschain_receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  console.log("\n=== Cross-chain demo complete ===\n");
  console.log(`Receipt: ${receiptPath}`);
  console.log(`Base tx (register): ${evmConfig.explorer}/tx/${registerTx.hash}`);
  console.log(`Base tx (set URI):  ${evmConfig.explorer}/tx/${evmSetUriTx.hash}`);
  console.log(
    `Starknet tx (deploy): ${starknetPreflight.networkConfig.explorer}/tx/${starknetDeploy.deployTxHash}`,
  );
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error("\nCROSS-CHAIN DEMO FAILED\n");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
