/**
 * Vesu V2 lending protocol helpers.
 * Vesu uses ERC-4626 vTokens for supply/withdraw.
 * @see https://docs.vesu.xyz/developers/interact/supply-withdraw
 */

import { CallData, cairo, type Call } from "starknet";
import { validateAndParseAddress } from "starknet";

/** Vesu V2 PoolFactory — mainnet */
export const VESU_POOL_FACTORY =
  "0x03760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0";

/** Vesu V2 Prime pool — mainnet */
export const VESU_PRIME_POOL =
  "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";

export interface RpcProviderLike {
  callContract: (req: {
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }) => Promise<{ result?: string[] } | string[]>;
}

/**
 * Fetch vToken address for a given pool and asset from Vesu PoolFactory.
 */
export async function getVTokenAddress(
  provider: RpcProviderLike,
  poolAddress: string,
  assetAddress: string
): Promise<string> {
  const parsedPool = validateAndParseAddress(poolAddress);
  const parsedAsset = validateAndParseAddress(assetAddress);

  const raw = await provider.callContract({
    contractAddress: VESU_POOL_FACTORY,
    entrypoint: "v_token_for_asset",
    calldata: [parsedPool, parsedAsset],
  });

  const arr = Array.isArray(raw) ? raw : (raw as { result?: string[] }).result;
  if (!arr || arr.length === 0) {
    throw new Error(`vToken not found for pool ${poolAddress} asset ${assetAddress}`);
  }

  return validateAndParseAddress(arr[0]).toLowerCase();
}

/**
 * Build ERC-20 approve + ERC-4626 deposit calls for Vesu supply.
 * Caller must have sufficient asset balance and allowance.
 */
export function buildDepositCalls(
  assetAddress: string,
  vTokenAddress: string,
  amountWei: bigint,
  receiver: string
): Call[] {
  if (amountWei <= 0n) {
    throw new Error("amount must be positive");
  }

  const parsedAsset = validateAndParseAddress(assetAddress);
  const parsedVToken = validateAndParseAddress(vTokenAddress);
  const parsedReceiver = validateAndParseAddress(receiver);

  const approveCall: Call = {
    contractAddress: parsedAsset,
    entrypoint: "approve",
    calldata: CallData.compile({
      spender: parsedVToken,
      amount: cairo.uint256(amountWei),
    }),
  };

  const depositCall: Call = {
    contractAddress: parsedVToken,
    entrypoint: "deposit",
    calldata: CallData.compile({
      assets: cairo.uint256(amountWei),
      receiver: parsedReceiver,
    }),
  };

  return [approveCall, depositCall];
}

/**
 * Build ERC-4626 withdraw call for Vesu.
 * Burns vToken shares and sends underlying assets to receiver.
 */
export function buildWithdrawCalls(
  vTokenAddress: string,
  amountWei: bigint,
  receiver: string,
  owner: string
): Call[] {
  if (amountWei <= 0n) {
    throw new Error("amount must be positive");
  }

  const parsedVToken = validateAndParseAddress(vTokenAddress);
  const parsedReceiver = validateAndParseAddress(receiver);
  const parsedOwner = validateAndParseAddress(owner);

  const withdrawCall: Call = {
    contractAddress: parsedVToken,
    entrypoint: "withdraw",
    calldata: CallData.compile({
      assets: cairo.uint256(amountWei),
      receiver: parsedReceiver,
      owner: parsedOwner,
    }),
  };

  return [withdrawCall];
}
