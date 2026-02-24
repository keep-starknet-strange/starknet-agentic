import {
  Account,
  CallData,
  ETransactionVersion,
  PaymasterRpc,
  RpcProvider,
  byteArray,
  cairo,
  ec,
  encode,
  hash,
  type Call,
  type PaymasterDetails,
} from "starknet";
import { trimTrailingChar as trimTrailingCharShared } from "../../shared/src/string";

export type ProviderLike = Pick<RpcProvider, "getChainId" | "callContract" | "waitForTransaction">;

export async function waitForTransactionWithTimeout<TReceipt = unknown>(args: {
  provider: ProviderLike;
  txHash: string;
  timeoutMs: number;
}): Promise<TReceipt> {
  const { provider, txHash, timeoutMs } = args;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive number");
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return (await Promise.race([
      provider.waitForTransaction(txHash) as Promise<TReceipt>,
      new Promise<TReceipt>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`waitForTransaction timed out after ${timeoutMs}ms (${txHash})`));
        }, timeoutMs);
      }),
    ])) as TReceipt;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

// Structural interface used by examples + unit tests (we only require tx hash back).
export interface DeployerAccountLike {
  execute(calls: Call | Call[]): Promise<{ transaction_hash: string }>;
  executePaymasterTransaction(
    calls: Call[],
    paymasterDetails: PaymasterDetails,
    maxFeeInGasToken?: unknown,
  ): Promise<{ transaction_hash: string }>;
}

export type StarknetNetworkConfigLike = {
  rpc: string;
  factory: string;
  registry: string;
  explorer?: string;
};

export const trimTrailingChar = trimTrailingCharShared;

export function formatBalance(raw: bigint, decimals: number): string {
  if (raw === 0n) {
    return "0";
  }
  const s = raw.toString();
  if (s.length <= decimals) {
    const frac = trimTrailingChar(s.padStart(decimals, "0"), "0");
    return frac ? `0.${frac}` : "0";
  }
  const whole = s.slice(0, s.length - decimals);
  const frac = trimTrailingChar(s.slice(s.length - decimals), "0");
  return frac ? `${whole}.${frac}` : whole;
}

export async function getErc20BalanceWei(args: {
  provider: ProviderLike;
  tokenAddress: string;
  accountAddress: string;
}): Promise<bigint> {
  const result = await args.provider.callContract({
    contractAddress: args.tokenAddress,
    entrypoint: "balance_of",
    calldata: [args.accountAddress],
  });
  const low = BigInt(result[0]);
  const high = BigInt(result[1]);
  return low + (high << 128n);
}

export async function getTokenBalances(args: {
  provider: ProviderLike;
  tokens: Record<string, string>;
  accountAddress: string;
  decimals?: number;
}): Promise<Record<string, string>> {
  const decimals = args.decimals ?? 18;
  const balances: Record<string, string> = {};
  for (const [symbol, tokenAddress] of Object.entries(args.tokens)) {
    try {
      const raw = await getErc20BalanceWei({
        provider: args.provider,
        tokenAddress,
        accountAddress: args.accountAddress,
      });
      balances[symbol] = formatBalance(raw, decimals);
    } catch {
      balances[symbol] = "error";
    }
  }
  return balances;
}

export function assertSepoliaChainId(chainId: string, network: string): void {
  if (network !== "sepolia") {
    return;
  }

  const isSepolia =
    chainId === "0x534e5f5345504f4c4941" /* SN_SEPOLIA (hex) */ ||
    chainId === "SN_SEPOLIA";
  if (!isSepolia) {
    throw new Error(`Network is "sepolia" but chain returned ${chainId}. Check STARKNET_RPC_URL.`);
  }
}

export interface StarknetPreflightResult {
  provider: RpcProvider;
  account: Account;
  chainId: string;
  balances: Record<string, string>;
}

export async function preflightStarknet(args: {
  network: string;
  networkConfig: StarknetNetworkConfigLike;
  tokens: Record<string, string>;
  accountAddress: string;
  privateKey: string;
  paymasterUrl?: string;
  paymasterApiKey?: string;
  rpcUrlOverride?: string;
}): Promise<StarknetPreflightResult> {
  const rpcUrl = args.rpcUrlOverride || args.networkConfig.rpc;
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  const chainId = String(await provider.getChainId());
  assertSepoliaChainId(chainId, args.network);

  // Attach paymaster to the deployer account so callers can use
  // account.executePaymasterTransaction() without unsafe casts.
  const paymaster = createPaymasterRpc({
    network: args.network,
    paymasterUrl: args.paymasterUrl,
    paymasterApiKey: args.paymasterApiKey,
  });

  const account = new Account({
    provider,
    address: args.accountAddress,
    signer: args.privateKey,
    transactionVersion: ETransactionVersion.V3,
    paymaster,
  });

  const balances = await getTokenBalances({
    provider,
    tokens: args.tokens,
    accountAddress: args.accountAddress,
  });

  return { provider, account, chainId, balances };
}

export function createRandomKeypair(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = ec.starkCurve.utils.randomPrivateKey();
  const privateKey = "0x" + encode.buf2hex(privateKeyBytes);
  const publicKey = ec.starkCurve.getStarkKey(privateKeyBytes);
  return { privateKey, publicKey };
}

export function parseFactoryAccountDeployedEvent(args: {
  factoryAddress: string;
  receipt: unknown;
}): { accountAddress: string | null; agentId: string | null } {
  const events = (args.receipt as { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> })
    .events;
  if (!events) {
    return { accountAddress: null, agentId: null };
  }

  const factory = args.factoryAddress.toLowerCase();
  const accountDeployedSelector = hash.getSelectorFromName("AccountDeployed").toLowerCase();

  for (const event of events) {
    if (!event?.from_address || !event.data) {
      continue;
    }
    if (event.from_address.toLowerCase() !== factory) {
      continue;
    }
    // If keys exist, require the correct event selector.
    if (event.keys && event.keys.length > 0 && event.keys[0]?.toLowerCase() !== accountDeployedSelector) {
      continue;
    }
    if (event.data.length < 4) {
      continue;
    }

    try {
      const accountAddress = event.data[0];
      const low = BigInt(event.data[2]);
      const high = BigInt(event.data[3]);
      const agentId = (low + (high << 128n)).toString();
      return { accountAddress, agentId };
    } catch {
      continue;
    }
  }

  return { accountAddress: null, agentId: null };
}

export interface DeployAccountResult {
  accountAddress: string;
  agentId: string;
  publicKey: string;
  privateKey: string;
  deployTxHash: string;
}

function createPaymasterRpc(args: { network: string; paymasterUrl?: string; paymasterApiKey?: string }): PaymasterRpc {
  const url =
    args.paymasterUrl ||
    (args.network === "sepolia" ? "https://sepolia.paymaster.avnu.fi" : "https://starknet.paymaster.avnu.fi");
  const headers = args.paymasterApiKey ? { "x-paymaster-api-key": args.paymasterApiKey } : {};
  return new PaymasterRpc({ nodeUrl: url, headers });
}

export async function deployAccountViaFactory(args: {
  provider: ProviderLike;
  factoryAddress: string;
  deployerAccount: DeployerAccountLike;
  tokenUri: string;
  gasfree?: boolean;
  requireEvent?: boolean;
  waitForTxTimeoutMs?: number;
  salt?: string;
}): Promise<DeployAccountResult> {
  const { privateKey, publicKey } = createRandomKeypair();
  const salt = args.salt || "0x" + encode.buf2hex(ec.starkCurve.utils.randomPrivateKey());

  const calldata = CallData.compile({
    public_key: publicKey,
    salt,
    token_uri: byteArray.byteArrayFromString(args.tokenUri),
  });

  const deployCall: Call = {
    contractAddress: args.factoryAddress,
    entrypoint: "deploy_account",
    calldata,
  };

  let txHash: string;
  if (args.gasfree) {
    const res = await args.deployerAccount.executePaymasterTransaction([deployCall], {
      feeMode: { mode: "sponsored" },
    });
    txHash = res.transaction_hash;
  } else {
    const res = await args.deployerAccount.execute(deployCall);
    txHash = res.transaction_hash;
  }

  const receipt = await waitForTransactionWithTimeout({
    provider: args.provider,
    txHash,
    timeoutMs: args.waitForTxTimeoutMs ?? 300_000,
  });
  const { accountAddress, agentId } = parseFactoryAccountDeployedEvent({
    factoryAddress: args.factoryAddress,
    receipt,
  });

  if (!accountAddress || !agentId) {
    if (args.requireEvent) {
      throw new Error("Failed to parse AccountDeployed event from factory tx receipt.");
    }
    return { accountAddress: "check_explorer", agentId: "", publicKey, privateKey, deployTxHash: txHash };
  }

  return { accountAddress, agentId, publicKey, privateKey, deployTxHash: txHash };
}

export interface FirstActionResult {
  balances: Record<string, string>;
  verifyTxHash: string | null;
}

export async function firstActionBalances(args: {
  provider: RpcProvider;
  tokens: Record<string, string>;
  accountAddress: string;
  privateKey: string;
  verifyTx: boolean;
  waitForTxTimeoutMs?: number;
}): Promise<FirstActionResult> {
  const balances = await getTokenBalances({
    provider: args.provider,
    tokens: args.tokens,
    accountAddress: args.accountAddress,
  });

  let verifyTxHash: string | null = null;
  if (args.verifyTx) {
    const ethAddress =
      args.tokens.ETH ||
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

    const account = new Account({
      provider: args.provider,
      address: args.accountAddress,
      signer: args.privateKey,
      transactionVersion: ETransactionVersion.V3,
    });

    const tx = await account.execute({
      contractAddress: ethAddress,
      entrypoint: "transfer",
      calldata: CallData.compile({
        recipient: args.accountAddress,
        amount: cairo.uint256(0),
      }),
    });

    await waitForTransactionWithTimeout({
      provider: args.provider,
      txHash: tx.transaction_hash,
      timeoutMs: args.waitForTxTimeoutMs ?? 300_000,
    });
    verifyTxHash = tx.transaction_hash;
  }

  return { balances, verifyTxHash };
}
