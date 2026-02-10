import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { FundingConfig, FundingProvider } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_ETH_BRIDGE_L1 = "0x8453FC6Cd1bCfE8D4dFC069C400B433054d47bDc";
const DEFAULT_L1_GAS_BUFFER_WEI = 1000000000000000n; // 0.001 ETH

const STARKGATE_ETH_BRIDGE_ABI = [
  "function deposit(uint256 amount, uint256 l2Recipient) payable",
] as const;

interface TxReceiptLike {
  hash: string;
  wait(): Promise<unknown>;
}

interface L1ProviderLike {
  getBalance(address: string): Promise<bigint>;
}

interface L1WalletLike {
  address: string;
}

interface L1BridgeLike {
  deposit(amount: bigint, l2Recipient: bigint, overrides: { value: bigint }): Promise<TxReceiptLike>;
}

interface StarkgateRuntime {
  createL1Provider(rpcUrl: string): L1ProviderLike;
  createL1Wallet(privateKey: string, provider: L1ProviderLike): L1WalletLike;
  createL1Bridge(bridgeAddress: string, wallet: L1WalletLike): L1BridgeLike;
  now(): number;
  sleep(ms: number): Promise<void>;
}

function defaultRuntime(): StarkgateRuntime {
  return {
    createL1Provider(rpcUrl) {
      return new JsonRpcProvider(rpcUrl);
    },
    createL1Wallet(privateKey, provider) {
      return new Wallet(privateKey, provider as JsonRpcProvider);
    },
    createL1Bridge(bridgeAddress, wallet) {
      return new Contract(bridgeAddress, STARKGATE_ETH_BRIDGE_ABI, wallet as Wallet) as unknown as L1BridgeLike;
    },
    now() {
      return Date.now();
    },
    async sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

function requireL1Config(config: FundingConfig): {
  l1RpcUrl: string;
  l1PrivateKey: string;
  bridgeAddress: string;
  timeoutMs: number;
  pollIntervalMs: number;
  gasBufferWei: bigint;
} {
  const l1RpcUrl = config.l1RpcUrl;
  const l1PrivateKey = config.l1PrivateKey;
  const bridgeAddress = config.starkgateEthBridgeAddress || DEFAULT_ETH_BRIDGE_L1;
  const timeoutMs = config.fundingTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = config.fundingPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const gasBufferWei = config.l1GasBufferWei ?? DEFAULT_L1_GAS_BUFFER_WEI;

  if (!l1RpcUrl) {
    throw new Error("L1_RPC_URL is required for FUNDING_PROVIDER=starkgate-l1.");
  }
  if (!l1PrivateKey) {
    throw new Error("L1_PRIVATE_KEY is required for FUNDING_PROVIDER=starkgate-l1.");
  }
  if (timeoutMs <= 0) {
    throw new Error("FUNDING_TIMEOUT_MS must be > 0.");
  }
  if (pollIntervalMs <= 0) {
    throw new Error("FUNDING_POLL_INTERVAL_MS must be > 0.");
  }
  if (gasBufferWei < 0n) {
    throw new Error("L1_GAS_BUFFER_WEI must be non-negative.");
  }

  return { l1RpcUrl, l1PrivateKey, bridgeAddress, timeoutMs, pollIntervalMs, gasBufferWei };
}

export function createStarkgateL1FundingProvider(runtime: StarkgateRuntime = defaultRuntime()): FundingProvider {
  let activeConfig: FundingConfig | null = null;
  return {
    name: "starkgate-l1",
    async preflight(config: FundingConfig): Promise<void> {
      requireL1Config(config);
      activeConfig = config;
    },
    async fund(params) {
      if (!activeConfig) {
        throw new Error("starkgate-l1 provider used before preflight configuration.");
      }
      const {
        l1RpcUrl,
        l1PrivateKey,
        bridgeAddress,
        timeoutMs,
        pollIntervalMs,
        gasBufferWei,
      } = requireL1Config(activeConfig);

      const l1Provider = runtime.createL1Provider(l1RpcUrl);
      const l1Wallet = runtime.createL1Wallet(l1PrivateKey, l1Provider);
      const requiredL1Wei = params.amountWei + gasBufferWei;
      const l1Balance = await l1Provider.getBalance(l1Wallet.address);

      if (l1Balance < requiredL1Wei) {
        throw new Error(
          `Insufficient L1 balance for StarkGate deposit: ${l1Balance.toString()} < ${requiredL1Wei.toString()} wei.`,
        );
      }

      const bridge = runtime.createL1Bridge(bridgeAddress, l1Wallet);
      const l2Recipient = BigInt(params.targetAddress);
      const tx = await bridge.deposit(params.amountWei, l2Recipient, { value: params.amountWei });
      await tx.wait();

      const deadline = runtime.now() + timeoutMs;
      while (runtime.now() < deadline) {
        const l2BalanceWei = await params.readTargetBalanceWei();
        if (l2BalanceWei >= params.requiredBalanceWei) {
          return {
            provider: "starkgate-l1",
            status: "confirmed",
            source_chain: "ethereum-sepolia",
            source_tx_hash: tx.hash,
            confirmed_at: new Date(runtime.now()).toISOString(),
            amount_wei: params.amountWei.toString(),
            token: params.token,
          };
        }
        await runtime.sleep(pollIntervalMs);
      }

      throw new Error(
        `Funding timeout after ${timeoutMs}ms waiting for Starknet balance. L1 tx hash: ${tx.hash}`,
      );
    },
  };
}

export const starkgateL1FundingProvider: FundingProvider = createStarkgateL1FundingProvider();
