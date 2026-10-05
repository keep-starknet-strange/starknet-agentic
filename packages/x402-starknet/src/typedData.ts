import type { TypedData } from "starknet"
import {
  SNIP12_REVISION,
  SNIP9_DOMAIN_NAME,
  SNIP9_DOMAIN_VERSION,
  STARKNET_NETWORKS,
  TRANSFER_SELECTOR,
  U128_MAX,
  type StarknetNetwork,
} from "./constants.js"
import { toFeltHex } from "./requirements.js"

/**
 * SNIP-9 version 2 `OutsideExecution` types, SNIP-12 revision 1, exactly as the
 * spec's "SNIP-12 Typed Data Structure" section lists them (same order).
 */
export const OUTSIDE_EXECUTION_TYPES = deepFreeze({
  StarknetDomain: [
    { name: "name", type: "shortstring" },
    { name: "version", type: "shortstring" },
    { name: "chainId", type: "shortstring" },
    { name: "revision", type: "shortstring" },
  ],
  OutsideExecution: [
    { name: "Caller", type: "ContractAddress" },
    { name: "Nonce", type: "felt" },
    { name: "Execute After", type: "u128" },
    { name: "Execute Before", type: "u128" },
    { name: "Calls", type: "Call*" },
  ],
  Call: [
    { name: "To", type: "ContractAddress" },
    { name: "Selector", type: "selector" },
    { name: "Calldata", type: "felt*" },
  ],
})

// Type aliases rather than interfaces: starknet.js's TypedData members carry
// index signatures, which object type aliases satisfy implicitly.
export type OutsideExecutionCall = {
  To: string
  Selector: string
  Calldata: string[]
}

export type OutsideExecutionMessage = {
  Caller: string
  Nonce: string
  "Execute After": string
  "Execute Before": string
  Calls: OutsideExecutionCall[]
}

export type OutsideExecutionDomain = {
  name: string
  version: string
  chainId: string
  revision: string
}

/** The SNIP-12 document a payer signs. Every felt is a lowercase 0x-hex string. */
export interface OutsideExecutionTypedData extends TypedData {
  types: Record<string, Array<{ name: string; type: string }>>
  primaryType: "OutsideExecution"
  domain: OutsideExecutionDomain
  message: OutsideExecutionMessage
}

/** Everything the signed document is built from. */
export interface PaymentAuthorization {
  network: StarknetNetwork
  /** SNIP-9 `Caller`: `extra.feePayer`. */
  caller: string
  nonce: string
  executeAfter: bigint
  executeBefore: bigint
  /** Token contract (`asset`). */
  asset: string
  /** Transfer recipient (`payTo`). */
  payTo: string
  /** Exact amount in the token's atomic units. */
  amount: bigint
}

/** Split a u256 into its Cairo `[low, high]` 128-bit limbs. */
export function splitU256(amount: bigint): { low: bigint; high: bigint } {
  return { low: amount & U128_MAX, high: amount >> 128n }
}

/**
 * Build the SNIP-9 v2 `OutsideExecution` typed data for one exact payment:
 * a single `transfer(payTo, amount)` call on `asset`, executable only by `caller`
 * between `executeAfter` and `executeBefore`. Pure; reads nothing but `auth`.
 */
export function buildOutsideExecutionTypedData(auth: PaymentAuthorization): OutsideExecutionTypedData {
  const { low, high } = splitU256(auth.amount)
  return {
    types: JSON.parse(JSON.stringify(OUTSIDE_EXECUTION_TYPES)) as OutsideExecutionTypedData["types"],
    primaryType: "OutsideExecution",
    domain: {
      name: SNIP9_DOMAIN_NAME,
      version: SNIP9_DOMAIN_VERSION,
      chainId: STARKNET_NETWORKS[auth.network],
      revision: SNIP12_REVISION,
    },
    message: {
      Caller: toFeltHex(auth.caller),
      Nonce: toFeltHex(auth.nonce),
      "Execute After": toFeltHex(auth.executeAfter),
      "Execute Before": toFeltHex(auth.executeBefore),
      Calls: [
        {
          To: toFeltHex(auth.asset),
          Selector: TRANSFER_SELECTOR,
          Calldata: [toFeltHex(auth.payTo), toFeltHex(low), toFeltHex(high)],
        },
      ],
    },
  }
}

/** Recursively freeze plain data. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}
