/**
 * Transaction receipt status helpers used when waiting for a submitted
 * transaction to reach a final, successful state.
 */

// Transaction wait config: ~120 s total (40 retries x 3 s interval).
export const TX_WAIT_RETRIES = 40;
export const TX_WAIT_INTERVAL_MS = 3_000;

export type TxReceiptLike = {
  transaction_hash?: string;
  execution_status?: string;
  finality_status?: string;
  statusReceipt?: string;
  revert_reason?: string | null;
  isSuccess?: () => boolean;
  isReverted?: () => boolean;
};

export function normalizeReceiptStatus(receipt?: TxReceiptLike): string {
  if (!receipt) return "UNKNOWN";
  const executionStatus =
    typeof receipt.execution_status === "string" ? receipt.execution_status.toUpperCase() : undefined;
  const finalityStatus =
    typeof receipt.finality_status === "string" ? receipt.finality_status.toUpperCase() : undefined;
  const legacyStatus =
    typeof receipt.statusReceipt === "string" ? receipt.statusReceipt.toUpperCase() : undefined;
  return executionStatus ?? finalityStatus ?? legacyStatus ?? "UNKNOWN";
}

export function isReceiptSuccessful(receipt?: TxReceiptLike): boolean {
  if (!receipt) return false;
  if (typeof receipt.isReverted === "function") {
    try {
      if (receipt.isReverted()) return false;
    } catch {
      // Fall through to field-based checks.
    }
  }
  if (typeof receipt.isSuccess === "function") {
    try {
      if (receipt.isSuccess()) {
        const finalityStatus =
          typeof receipt.finality_status === "string" ? receipt.finality_status.toUpperCase() : undefined;
        return (
          finalityStatus === undefined ||
          finalityStatus === "ACCEPTED_ON_L2" ||
          finalityStatus === "ACCEPTED_ON_L1"
        );
      }
    } catch {
      // Fall back to explicit status fields below.
    }
  }

  const executionStatus =
    typeof receipt.execution_status === "string" ? receipt.execution_status.toUpperCase() : undefined;
  const finalityStatus =
    typeof receipt.finality_status === "string" ? receipt.finality_status.toUpperCase() : undefined;

  if (executionStatus === "REVERTED") return false;
  if (finalityStatus === "REJECTED" || finalityStatus === "ABORTED") return false;
  if (
    finalityStatus === "NOT_RECEIVED" ||
    finalityStatus === "RECEIVED" ||
    finalityStatus === "CANDIDATE" ||
    finalityStatus === "PRE_CONFIRMED"
  ) {
    return false;
  }

  if (executionStatus === "SUCCEEDED") {
    return (
      finalityStatus === undefined ||
      finalityStatus === "ACCEPTED_ON_L2" ||
      finalityStatus === "ACCEPTED_ON_L1"
    );
  }

  // Unknown/non-final states are not safe to treat as success.
  return false;
}
