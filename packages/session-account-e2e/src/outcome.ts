/**
 * Classifies node responses so each E2E row fails for the reason it claims to test.
 *
 * - Spending-policy limits are enforced in SessionAccount.__execute__, so they surface
 *   as an execution revert carrying the Cairo panic string (e.g. 'Spending: exceeds per-call').
 *   That string can only appear after __validate__ accepted the session signature.
 * - Session call-policy checks (admin selector blocklist, self-call guard, entrypoint
 *   whitelist) run in __validate__, which returns 0 instead of panicking, so the node
 *   reports a validation failure with no reason string.
 * - SessionAccount swallows failing inner calls and emits CallFailed instead of
 *   reverting, so a SUCCEEDED receipt alone does not prove the transfer happened.
 */
import { RpcError, hash, num, shortString } from "starknet";

const RPC_VALIDATION_FAILURE = 55;
const VALIDATE_SELECTOR_DIGITS = hash.getSelectorFromName("__validate__").slice(2).toLowerCase();
// Blockifier (used by Starknet nodes) reports a __validate__ that returned 0 as
// "The `validate` entry point should return `VALID`. Got Retdata([0x0])."
const VALIDATION_FAILURE_PATTERNS = [/`?validate`? entry point/i, /validation fail/i, /validate_failure/i];

export const CALL_FAILED_EVENT_KEY = hash.getSelectorFromName("CallFailed");

/**
 * The node's error payload only. RpcError.message also embeds the request params
 * (our calldata and signature), which must not be searched for revert reasons.
 */
export function errorDetail(error: unknown): string {
  if (error instanceof RpcError) {
    return `${error.baseError.code}: ${error.baseError.message}: ${JSON.stringify(error.baseError.data ?? null)}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** True when the error payload carries `reason` as text or as its short-string felt. */
export function hasRevertReason(error: unknown, reason: string): boolean {
  const detail = errorDetail(error);
  if (detail.includes(reason)) return true;
  if (shortString.isShortString(reason) && shortString.isASCII(reason)) {
    const felt = shortString.encodeShortString(reason).slice(2).toLowerCase();
    return detail.toLowerCase().includes(felt);
  }
  return false;
}

/** True when the node rejected the transaction in __validate__. */
export function isValidationFailure(error: unknown): boolean {
  if (error instanceof RpcError && error.baseError.code === RPC_VALIDATION_FAILURE) return true;
  const detail = errorDetail(error);
  return (
    VALIDATION_FAILURE_PATTERNS.some((pattern) => pattern.test(detail)) ||
    detail.toLowerCase().includes(VALIDATE_SELECTOR_DIGITS)
  );
}

interface ReceiptEvent {
  from_address: string;
  keys: string[];
}

/** Indexes of calls that SessionAccount reported as failed via CallFailed events. */
export function failedCallIndexes(events: ReceiptEvent[], accountAddress: string): number[] {
  const account = BigInt(accountAddress);
  const callFailed = BigInt(CALL_FAILED_EVENT_KEY);
  return events
    .filter(
      (event) =>
        BigInt(event.from_address) === account &&
        event.keys.length >= 2 &&
        BigInt(event.keys[0]) === callFailed,
    )
    .map((event) => Number(num.toBigInt(event.keys[1])));
}
