import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { cairo, uint256 } from "starknet";
import { validateTokensInputAsync } from "../utils.js";
import { getTokenService } from "../services/index.js";
import { getVTokenAddress, VESU_PRIME_POOL } from "../helpers/vesu.js";
import { formatAmount } from "../utils/formatter.js";
import {
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_vesu_positions",
  description:
    "Get lending positions (vToken balances and converted assets) for the agent's address in Vesu V2 pools.",
  inputSchema: {
    type: "object",
    properties: {
      tokens: {
        type: "array",
        items: { type: "string" },
        description: "Token symbols (STRK, ETH, USDC, USDT) or addresses to check",
      },
      address: {
        type: "string",
        description: "Address to check (defaults to agent's address)",
      },
      pool: {
        type: "string",
        description: "Vesu pool address. Defaults to Prime pool.",
      },
    },
    required: ["tokens"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, provider, vesuPoolFactoryAddress } = ctx;

  const { tokens, address = env.STARKNET_ACCOUNT_ADDRESS, pool = VESU_PRIME_POOL } = args as {
    tokens: string[];
    address?: string;
    pool?: string;
  };

  if (!tokens || tokens.length === 0) {
    throw new Error("At least one token is required");
  }

  const poolAddress = parseAddress("pool", pool);
  const userAddress = parseAddress("address", address);
  const tokenAddresses = await validateTokensInputAsync(tokens);
  const tokenService = getTokenService();

  const positions: Array<{
    token: string;
    tokenAddress: string;
    shares: string;
    assets: string;
    decimals: number;
  }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const assetAddress = tokenAddresses[i];
    const vTokenAddress = await getVTokenAddress(
      provider,
      poolAddress,
      assetAddress,
      vesuPoolFactoryAddress,
    );

    const balanceRaw = await provider.callContract({
      contractAddress: vTokenAddress,
      entrypoint: "balance_of",
      calldata: [userAddress],
    });

    const balanceArr = Array.isArray(balanceRaw) ? balanceRaw : (balanceRaw as { result?: string[] }).result ?? [];
    const balanceVal = balanceArr.length >= 2
      ? { low: BigInt(balanceArr[0]), high: BigInt(balanceArr[1] ?? 0) }
      : (balanceRaw as { balance?: { low: bigint; high: bigint } })?.balance ?? { low: 0n, high: 0n };
    const shares = uint256.uint256ToBN(balanceVal);

    let assets = shares;
    if (shares > 0n) {
      const sharesU256 = cairo.uint256(shares);
      const assetsRaw = await provider.callContract({
        contractAddress: vTokenAddress,
        entrypoint: "convert_to_assets",
        calldata: [String(sharesU256.low), String(sharesU256.high)],
      });
      const assetsArr = Array.isArray(assetsRaw) ? assetsRaw : (assetsRaw as { result?: string[] }).result ?? [];
      if (assetsArr.length >= 2) {
        assets = uint256.uint256ToBN({
          low: BigInt(assetsArr[0]),
          high: BigInt(assetsArr[1] ?? 0),
        });
      }
    }

    const decimals = await tokenService.getDecimalsAsync(assetAddress);
    positions.push({
      token: tokens[i],
      tokenAddress: assetAddress,
      shares: formatAmount(shares, decimals),
      assets: formatAmount(assets, decimals),
      decimals,
    });
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          address: userAddress,
          pool: pool === VESU_PRIME_POOL ? "prime" : pool,
          positions,
        }, null, 2),
      },
    ],
  };
}
