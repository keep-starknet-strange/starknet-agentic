import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  networkForChainId,
  prepareStarknetPayment,
  signPreparedStarknetPayment,
} from "@starknetfoundation/starknet-agentic-x402-starknet";
import {
  findStaticToken,
  getTokenService,
  networkForStarknetChainId,
  type CachedToken,
} from "../services/index.js";
import { formatAmount } from "../utils/formatter.js";
import { log } from "../logger.js";
import type { ToolArgs, ToolContext, ToolResult } from "./_shared.js";

const TOOL_NAME = "x402_starknet_sign_payment_required";

export const definition: Tool = {
  name: TOOL_NAME,
  description:
    "Pay for an x402-protected resource on Starknet (x402 v2, exact scheme). Takes the PAYMENT-REQUIRED " +
    "response header, builds the payment itself from the server's requirements (one token transfer of the " +
    "exact amount to payTo, executable only by the server's feePayer, valid for maxTimeoutSeconds), checks " +
    "it against the spending policy, signs it and returns the PAYMENT-SIGNATURE request header plus a summary " +
    "of what was authorized. Never signs typed data supplied by the server.",
  inputSchema: {
    type: "object",
    properties: {
      paymentRequiredHeader: {
        type: "string",
        description: "Value of the PAYMENT-REQUIRED response header (standard base64 of an x402 v2 PaymentRequired).",
      },
      acceptIndex: {
        type: "integer",
        minimum: 0,
        description:
          "Optional index into the header's accepts array of the payment option to pay. Defaults to the first " +
          "'exact' option on this server's Starknet network.",
      },
    },
    required: ["paymentRequiredHeader"],
  },
};

const argsSchema = z.object({
  paymentRequiredHeader: z.string().min(1),
  acceptIndex: z.number().int().min(0).optional(),
});

/** Listed only in direct signer mode (signing needs the in-process private key). */
export const isListed = (ctx: ToolContext): boolean => ctx.signerMode === "direct";

/**
 * Built-in token at `asset` on the chain being paid on. Policy trusts symbols
 * only from this list, never from runtime token metadata.
 */
function builtInTokenFor(asset: string, chainId: string): CachedToken | undefined {
  const network = networkForStarknetChainId(chainId);
  return network ? findStaticToken(asset, network) : undefined;
}

async function tokenDecimals(asset: string, builtIn: CachedToken | undefined): Promise<number | undefined> {
  if (builtIn) return builtIn.decimals;
  try {
    const decimals = await getTokenService().getDecimalsAsync(asset);
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : undefined;
  } catch {
    return undefined;
  }
}

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, signerMode, provider, policyGuard } = ctx;

  if (signerMode === "proxy") {
    throw new Error(
      `${TOOL_NAME} is disabled in STARKNET_SIGNER_MODE=proxy (the signer API has no x402 outside-execution signing endpoint)`
    );
  }
  if (!env.STARKNET_ACCOUNT_ADDRESS || !env.STARKNET_PRIVATE_KEY) {
    throw new Error("Missing required env vars for x402 signing (STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY)");
  }
  if (!policyGuard || typeof policyGuard.evaluatePayment !== "function") {
    throw new Error("x402 signing requires the policy guard; refusing to sign");
  }

  const parsedArgs = argsSchema.safeParse(args ?? {});
  if (!parsedArgs.success) {
    throw new Error(
      "Invalid arguments: paymentRequiredHeader must be a non-empty string and acceptIndex a non-negative integer"
    );
  }
  const { paymentRequiredHeader, acceptIndex } = parsedArgs.data;

  // The chain the configured account lives on decides which offers are payable.
  const chainId = await provider.getChainId();
  const network = networkForChainId(chainId);

  // Decode, select and validate; nothing is signed yet.
  const prepared = prepareStarknetPayment({
    paymentRequiredHeader,
    network,
    accountAddress: env.STARKNET_ACCOUNT_ADDRESS,
    acceptIndex,
  });
  const { asset, payTo, amount } = prepared.requirements;

  // The payment moves `amount` of `asset` to `payTo`: hold it to the transfer policy.
  const builtIn = builtInTokenFor(asset, chainId);
  const decimals = await tokenDecimals(asset, builtIn);
  const trustedSymbol = builtIn?.symbol;
  const decision = policyGuard.evaluatePayment({ asset, payTo, amount, decimals, trustedSymbol });
  if (!decision.allowed) {
    log({
      level: "warn",
      event: "x402.payment_blocked",
      tool: TOOL_NAME,
      details: { reason: decision.reason, network, asset, payTo, amount: amount.toString() },
    });
    throw new Error(`Policy violation: ${decision.reason}`);
  }

  const { headerValue, summary } = await signPreparedStarknetPayment(prepared, {
    privateKey: env.STARKNET_PRIVATE_KEY,
  });

  const amountFormatted = decimals !== undefined ? formatAmount(amount, decimals) : undefined;
  const tokenLabel = trustedSymbol ?? summary.asset;
  const description =
    `Authorized a payment of ${amountFormatted ?? `${summary.amount} atomic units`} ${tokenLabel} ` +
    `to ${summary.payTo} on ${summary.network}, executable only by ${summary.feePayer} until ${summary.validUntilIso}.`;

  log({
    level: "info",
    event: "x402.payment_signed",
    tool: TOOL_NAME,
    details: { ...summary },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            paymentSignatureHeader: headerValue,
            summary: {
              ...summary,
              assetSymbol: trustedSymbol ?? null,
              decimals: decimals ?? null,
              amountFormatted: amountFormatted ?? null,
              description,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
