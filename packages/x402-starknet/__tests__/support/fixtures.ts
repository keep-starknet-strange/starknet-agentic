import { ec } from "starknet"

// Addresses from the spec's own examples (scheme_exact_starknet.md).
export const SPEC_ASSET = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343"
export const SPEC_PAY_TO = "0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57"
export const SPEC_FEE_PAYER = "0x05f2e02acd59f37f1e19da7ea1db6bf31d49e6e5ba66a7f1c2f0e2ba1be36f81"
export const SPEC_PAYER = "0x03f16efeb2ae57f7d8befb03af08a3a370562dde15149c3506ac2038ffa9be24"

export const ATTACKER = "0x0666000000000000000000000000000000000000000000000000000000000bad"
export const OTHER_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
export const ANY_CALLER_SENTINEL = "0x414e595f43414c4c4552"
export const SEPOLIA = "starknet:SN_SEPOLIA" as const
export const MAINNET = "starknet:SN_MAIN" as const

export const RESOURCE = {
  url: "https://api.example.com/premium-data",
  description: "Access to premium market data",
  mimeType: "application/json",
}

export function requirement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scheme: "exact",
    network: SEPOLIA,
    amount: "10000",
    asset: SPEC_ASSET,
    payTo: SPEC_PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { feePayer: SPEC_FEE_PAYER },
    ...overrides,
  }
}

export function paymentRequired(
  accepts: unknown[] = [requirement()],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { x402Version: 2, resource: RESOURCE, accepts, ...extra }
}

/** Standard base64, the way an x402 v2 server emits PAYMENT-REQUIRED. */
export function toHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64")
}

export function throwawayPrivateKey(): string {
  return `0x${Buffer.from(ec.starkCurve.utils.randomPrivateKey()).toString("hex")}`
}

export function publicKeyOf(privateKey: string): Uint8Array {
  return ec.starkCurve.getPublicKey(privateKey, false)
}
