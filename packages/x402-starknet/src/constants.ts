/**
 * Constants of the x402 `exact` scheme on Starknet.
 *
 * Implemented against x402-foundation/x402 `specs/schemes/exact/scheme_exact_starknet.md`
 * at commit 751590a25e7ecc22ee044b37fd55c2b66cc14fd6 (see SPEC_REVISION).
 */

/** Spec revision this package implements (x402-foundation/x402 commit SHA). */
export const SPEC_REVISION = "751590a25e7ecc22ee044b37fd55c2b66cc14fd6"

/** The only x402 protocol version the Starknet `exact` scheme supports. */
export const X402_VERSION = 2

/** Scheme identifier. */
export const EXACT_SCHEME = "exact"

/**
 * CAIP-2 network identifiers and the chain id felt each one maps to (the hex
 * encoding of the `starknet_chainId` short string).
 */
export const STARKNET_NETWORKS = {
  "starknet:SN_MAIN": "0x534e5f4d41494e",
  "starknet:SN_SEPOLIA": "0x534e5f5345504f4c4941",
} as const

export type StarknetNetwork = keyof typeof STARKNET_NETWORKS

export const STARKNET_NETWORK_IDS = Object.keys(STARKNET_NETWORKS) as StarknetNetwork[]

/**
 * `sn_keccak("transfer")`, the SNIP-2 `transfer` entry point selector. Hard-coded
 * from the spec (Facilitator Verification Rules, rule 7) rather than derived at
 * runtime; a test checks it against starknet.js's `getSelectorFromName`.
 */
export const TRANSFER_SELECTOR = "0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e"

/**
 * SNIP-9 any-caller sentinel, the short string `ANY_CALLER`. The payer's account
 * treats it as a wildcard, so a payment bound to it could be submitted by anyone.
 * Clients MUST refuse it as `extra.feePayer`.
 */
export const ANY_CALLER = "0x414e595f43414c4c4552"

/** SNIP-9 v2 / SNIP-12 revision 1 domain values. */
export const SNIP9_DOMAIN_NAME = "Account.execute_from_outside"
export const SNIP9_DOMAIN_VERSION = "2"
export const SNIP12_REVISION = "1"

/**
 * `Execute After` bound the client signs. The spec says it SHOULD be well in the
 * past and gives `1` as the example; facilitators reject `Execute After >= now - skewMargin`.
 */
export const EXECUTE_AFTER = 1n

/**
 * Default upper bound on `maxTimeoutSeconds` this client will sign. The spec
 * makes the client sign `Execute Before = now + maxTimeoutSeconds`, so the server
 * chooses how long the authorization stays valid. Requirements asking for a longer
 * window are rejected rather than shortened: a shortened window would be refused
 * by a conformant facilitator anyway (`outside_execution_expired`).
 */
export const DEFAULT_MAX_TIMEOUT_SECONDS_CAP = 3600

/** Hard ceiling for a caller-supplied cap (one day). */
export const MAX_TIMEOUT_SECONDS_CAP_LIMIT = 86_400

/** The Cairo field modulus. */
export const STARK_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n

/** Contract addresses are strictly below 2^251 - 256 (starknet `ADDR_BOUND`). */
export const ADDR_BOUND = 2n ** 251n - 256n

export const U128_MAX = (1n << 128n) - 1n
export const U256_MAX = (1n << 256n) - 1n

/** Bounds on untrusted input, so a hostile server cannot make the client do unbounded work. */
export const MAX_HEADER_LENGTH = 64 * 1024
export const MAX_ACCEPTS = 64

/** A Starknet signature is a felt array; bound it like facilitators do (spec: "~32 felts"). */
export const MAX_SIGNATURE_FELTS = 32
