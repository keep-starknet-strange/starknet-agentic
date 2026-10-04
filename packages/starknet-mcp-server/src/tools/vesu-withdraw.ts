import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveTokenAddressAsync } from "../utils.js";
import { TOKENS } from "../services/index.js";
import { getVTokenAddress, buildWithdrawCalls, VESU_PRIME_POOL } from "../helpers/vesu.js";
import {
  parseAddress,
  parseAmount,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_vesu_withdraw",
  description:
    "Withdraw assets from Vesu V2 lending pool. Withdraws underlying assets (not shares). Supports gasfree mode.",
  inputSchema: {
    type: "object",
    properties: {
      token: {
        type: "string",
        description: "Token symbol (STRK, ETH, USDC, USDT) or address",
      },
      amount: {
        type: "string",
        description: "Amount of underlying assets to withdraw",
      },
      pool: {
        type: "string",
        description: "Vesu pool address. Defaults to Prime pool.",
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode",
        default: false,
      },
      gasToken: {
        type: "string",
        description: "Token to pay gas in when gasfree=true",
      },
    },
    required: ["token", "amount"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { provider, account, vesuPoolFactoryAddress, executeTransaction, waitForTransactionSuccess } = ctx;

  const { token, amount, pool = VESU_PRIME_POOL, gasfree = false, gasToken } = args as {
    token: string;
    amount: string;
    pool?: string;
    gasfree?: boolean;
    gasToken?: string;
  };

  const poolAddress = parseAddress("pool", pool);
  const assetAddress = await resolveTokenAddressAsync(token);
  const amountWei = await parseAmount(amount, assetAddress);
  if (amountWei <= 0n) {
    throw new Error("Amount must be positive");
  }

  const vTokenAddress = await getVTokenAddress(
    provider,
    poolAddress,
    assetAddress,
    vesuPoolFactoryAddress,
  );
  const calls = buildWithdrawCalls(
    vTokenAddress,
    amountWei,
    account.address,
    account.address
  );

  const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
  const transactionHash = await executeTransaction(calls, gasfree, gasTokenAddress);
  await waitForTransactionSuccess(transactionHash, "starknet_vesu_withdraw");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          transactionHash,
          token,
          amount,
        }, null, 2),
      },
    ],
  };
}
