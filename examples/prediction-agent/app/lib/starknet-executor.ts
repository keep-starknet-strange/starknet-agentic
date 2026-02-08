import { Account, RpcProvider, Contract, CallData, constants } from "starknet";
import { config } from "./config";
import { toScaled } from "./accuracy";

const provider = new RpcProvider({ nodeUrl: config.STARKNET_RPC_URL });

// V3 transaction details — Sepolia requires V3 (V1 disabled)
const V3_DETAILS = { version: constants.TRANSACTION_VERSION.V3 as any };

/** Get an account instance for transaction signing. */
function getAccount(): Account | null {
  if (!config.AGENT_PRIVATE_KEY || !config.AGENT_ADDRESS) return null;
  return new Account(provider, config.AGENT_ADDRESS, config.AGENT_PRIVATE_KEY, "1");
}

export interface TxResult {
  txHash: string;
  status: "success" | "error";
  error?: string;
}

/** Place a bet on a prediction market. */
export async function placeBet(
  marketAddress: string,
  outcome: 0 | 1,
  amount: bigint,
  collateralToken: string
): Promise<TxResult> {
  const account = getAccount();
  if (!account) {
    return { txHash: "", status: "error", error: "No agent account configured" };
  }

  try {
    // Approve collateral spend
    const approveTx = {
      contractAddress: collateralToken,
      entrypoint: "approve",
      calldata: CallData.compile({
        spender: marketAddress,
        amount: { low: amount, high: 0n },
      }),
    };

    // Place the bet
    const betTx = {
      contractAddress: marketAddress,
      entrypoint: "bet",
      calldata: CallData.compile({
        outcome,
        amount: { low: amount, high: 0n },
      }),
    };

    const result = await account.execute([approveTx, betTx], undefined, V3_DETAILS);
    await provider.waitForTransaction(result.transaction_hash);

    return { txHash: result.transaction_hash, status: "success" };
  } catch (err: any) {
    return { txHash: "", status: "error", error: err.message };
  }
}

/** Record an agent prediction on the accuracy tracker. */
export async function recordPrediction(
  marketId: number,
  probability: number
): Promise<TxResult> {
  const account = getAccount();
  if (!account) {
    return { txHash: "", status: "error", error: "No agent account configured" };
  }

  const trackerAddress = config.ACCURACY_TRACKER_ADDRESS;
  if (trackerAddress === "0x0") {
    return { txHash: "", status: "error", error: "Accuracy tracker not deployed" };
  }

  try {
    const scaledProb = toScaled(probability);

    const tx = {
      contractAddress: trackerAddress,
      entrypoint: "record_prediction",
      calldata: CallData.compile({
        market_id: { low: BigInt(marketId), high: 0n },
        predicted_prob: { low: scaledProb, high: 0n },
      }),
    };

    const result = await account.execute([tx], undefined, V3_DETAILS);
    await provider.waitForTransaction(result.transaction_hash);

    return { txHash: result.transaction_hash, status: "success" };
  } catch (err: any) {
    return { txHash: "", status: "error", error: err.message };
  }
}

/** Claim winnings from a resolved market. */
export async function claimWinnings(marketAddress: string): Promise<TxResult> {
  const account = getAccount();
  if (!account) {
    return { txHash: "", status: "error", error: "No agent account configured" };
  }

  try {
    const tx = {
      contractAddress: marketAddress,
      entrypoint: "claim",
      calldata: [],
    };

    const result = await account.execute([tx], undefined, V3_DETAILS);
    await provider.waitForTransaction(result.transaction_hash);

    return { txHash: result.transaction_hash, status: "success" };
  } catch (err: any) {
    return { txHash: "", status: "error", error: err.message };
  }
}

/** Check if the agent has an account configured. */
export function isAgentConfigured(): boolean {
  return !!(config.AGENT_PRIVATE_KEY && config.AGENT_ADDRESS);
}

/** Get the agent's address. */
export function getAgentAddress(): string | null {
  return config.AGENT_ADDRESS ?? null;
}
