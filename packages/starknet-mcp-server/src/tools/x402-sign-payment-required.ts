import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createStarknetPaymentSignatureHeader } from "@starknetfoundation/starknet-agentic-x402-starknet";
import type { ToolArgs, ToolContext, ToolResult } from "./_shared.js";

export const definition: Tool = {
  name: "x402_starknet_sign_payment_required",
  description:
    "Sign a base64 PAYMENT-REQUIRED header containing Starknet typedData, return a base64 PAYMENT-SIGNATURE header value.",
  inputSchema: {
    type: "object",
    properties: {
      paymentRequiredHeader: {
        type: "string",
        description: "Base64 JSON from PAYMENT-REQUIRED header",
      },
    },
    required: ["paymentRequiredHeader"],
  },
};

/** Listed only in direct signer mode (signing needs the in-process private key). */
export const isListed = (ctx: ToolContext): boolean => ctx.signerMode === "direct";

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, signerMode } = ctx;

  const { paymentRequiredHeader } = args as {
    paymentRequiredHeader: string;
  };

  if (signerMode === "proxy") {
    throw new Error(
      "x402_starknet_sign_payment_required is disabled in STARKNET_SIGNER_MODE=proxy (requires direct private key signing)"
    );
  }

  if (!env.STARKNET_RPC_URL || !env.STARKNET_ACCOUNT_ADDRESS || !env.STARKNET_PRIVATE_KEY) {
    throw new Error(
      "Missing required env vars for x402 signing (STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY)",
    );
  }

  const { headerValue, payload } = await createStarknetPaymentSignatureHeader({
    paymentRequiredHeader,
    rpcUrl: env.STARKNET_RPC_URL,
    accountAddress: env.STARKNET_ACCOUNT_ADDRESS,
    privateKey: env.STARKNET_PRIVATE_KEY,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            paymentSignatureHeader: headerValue,
            payload,
          },
          null,
          2
        ),
      },
    ],
  };
}
