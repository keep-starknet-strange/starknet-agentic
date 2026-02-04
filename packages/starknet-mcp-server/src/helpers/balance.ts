import { Contract, RpcProvider, uint256 } from "starknet";
import { normalizeAddress } from "../utils.js";
import { getTokenService } from "../services/index.js";

/** Convert a balance result (bigint or Uint256) to bigint */
function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  return uint256.uint256ToBN(value as { low: bigint; high: bigint });
}

export const BALANCE_CHECKER_ADDRESS = "0x031ce64a666fbf9a2b1b2ca51c2af60d9a76d3b85e5fbfb9d5a8dbd3fedc9716";

export const BALANCE_CHECKER_ABI = [
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      { name: "low", type: "core::integer::u128" },
      { name: "high", type: "core::integer::u128" },
    ],
  },
  {
    type: "struct",
    name: "governance::balance_checker::NonZeroBalance",
    members: [
      { name: "token", type: "core::starknet::contract_address::ContractAddress" },
      { name: "balance", type: "core::integer::u256" },
    ],
  },
  {
    type: "function",
    name: "get_balances",
    inputs: [
      { name: "address", type: "core::starknet::contract_address::ContractAddress" },
      { name: "tokens", type: "core::array::Span::<core::starknet::contract_address::ContractAddress>" },
    ],
    outputs: [
      { type: "core::array::Span::<governance::balance_checker::NonZeroBalance>" },
    ],
    state_mutability: "view",
  },
];

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "felt" }],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "recipient", type: "felt" },
      { name: "amount", type: "Uint256" },
    ],
    outputs: [{ name: "success", type: "felt" }],
  },
];

export type TokenBalanceResult = {
  token: string;
  tokenAddress: string;
  balance: bigint;
  decimals: number;
};

export type BatchBalanceResult = {
  balances: TokenBalanceResult[];
  method: "balance_checker" | "batch_rpc";
};

type NonZeroBalanceResponse = {
  token: bigint;
  balance: unknown;
};

/**
 * Fetch single token balance for an address.
 */
export async function fetchTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  provider: RpcProvider
): Promise<{ balance: bigint; decimals: number }> {
  const contract = new Contract({
    abi: ERC20_ABI,
    address: tokenAddress,
    providerOrAccount: provider,
  });

  const tokenService = getTokenService();
  const [balanceResult, decimals] = await Promise.all([
    contract.balanceOf(walletAddress),
    tokenService.getDecimalsAsync(tokenAddress),
  ]);

  const balance = toBigInt(balanceResult?.balance ?? balanceResult);
  return { balance, decimals };
}

// Internal: batch RPC fallback
async function fetchBalancesViaBatchRpc(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[],
  provider: RpcProvider
): Promise<TokenBalanceResult[]> {
  const results = await Promise.all(
    tokenAddresses.map((addr) => fetchTokenBalance(walletAddress, addr, provider))
  );

  return tokens.map((token, i) => ({
    token,
    tokenAddress: tokenAddresses[i],
    balance: results[i].balance,
    decimals: results[i].decimals,
  }));
}

// Internal: BalanceChecker contract
async function fetchBalancesViaBalanceChecker(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[],
  provider: RpcProvider
): Promise<TokenBalanceResult[]> {
  const balanceChecker = new Contract({
    abi: BALANCE_CHECKER_ABI,
    address: BALANCE_CHECKER_ADDRESS,
    providerOrAccount: provider,
  });

  const result: NonZeroBalanceResponse[] = await balanceChecker.get_balances(walletAddress, tokenAddresses);

  const balanceMap = new Map<string, bigint>();
  for (const item of result) {
    const addr = normalizeAddress("0x" + BigInt(item.token).toString(16));
    balanceMap.set(addr, toBigInt(item.balance));
  }

  const tokenService = getTokenService();
  const decimalsResults = await Promise.all(
    tokenAddresses.map((addr) => tokenService.getDecimalsAsync(addr))
  );

  return tokens.map((token, i) => ({
    token,
    tokenAddress: tokenAddresses[i],
    balance: balanceMap.get(normalizeAddress(tokenAddresses[i])) ?? BigInt(0),
    decimals: decimalsResults[i],
  }));
}

/**
 * Fetch multiple token balances in an optimized way.
 * Tries BalanceChecker contract first, falls back to batch RPC.
 */
export async function fetchTokenBalances(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[],
  provider: RpcProvider
): Promise<BatchBalanceResult> {
  try {
    const balances = await fetchBalancesViaBalanceChecker(
      walletAddress,
      tokens,
      tokenAddresses,
      provider
    );
    return { balances, method: "balance_checker" };
  } catch (error) {
    console.error(
      "BalanceChecker contract unavailable, falling back to batch RPC:",
      error instanceof Error ? error.message : error
    );
    const balances = await fetchBalancesViaBatchRpc(
      walletAddress,
      tokens,
      tokenAddresses,
      provider
    );
    return { balances, method: "batch_rpc" };
  }
}
