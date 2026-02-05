import { Contract, type AccountInterface, type ProviderInterface, byteArray } from "starknet"
import { identityRegistryAbi } from "./identityRegistryAbi.js"

export type AgentCapability = {
  /** Stable identifier, ex: "swap" or "balance" */
  name: string
  /** Human description */
  description?: string
  /** Optional endpoint or tool id */
  endpoint?: string
  /** Optional schema/versioning hooks */
  version?: string
  /** Free-form payload */
  [k: string]: unknown
}

export const PASSPORT_CAPS_KEY = "caps" as const

export function capabilityKey(name: string): string {
  if (!name.trim()) throw new Error("Capability name is empty")
  return `capability:${name}`
}

export function encodeStringAsByteArray(v: string) {
  return byteArray.byteArrayFromString(v)
}

export function decodeByteArrayAsString(v: unknown): string {
  return byteArray.stringFromByteArray(v as never)
}

export function parseCapsList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return []
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error("caps metadata must be a JSON array")
  const names = parsed.map((x) => {
    if (typeof x !== "string") throw new Error("caps metadata entries must be strings")
    return x
  })
  // Deduplicate while preserving order
  return [...new Set(names)]
}

export function stringifyCapsList(names: string[]): string {
  const normalized = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  return JSON.stringify(normalized)
}

export class IdentityRegistryPassportClient {
  private contract: Contract

  constructor(args: {
    identityRegistryAddress: string
    provider: ProviderInterface
    account?: AccountInterface
  }) {
    this.contract = new Contract({
      abi: identityRegistryAbi as unknown as any[],
      address: args.identityRegistryAddress,
      providerOrAccount: args.provider as any,
    })
    if (args.account) this.contract.connect(args.account)
  }

  async agentExists(agentId: bigint): Promise<boolean> {
    const res = await (this.contract as any).agent_exists(agentId)
    return Boolean(res)
  }

  async getMetadata(agentId: bigint, key: string): Promise<string> {
    const res = await (this.contract as any).get_metadata(agentId, encodeStringAsByteArray(key))
    return decodeByteArrayAsString(res)
  }

  async setMetadata(agentId: bigint, key: string, value: string) {
    // starknet.js Contract typing often expects named args, but ABI-driven calls are fine at runtime.
    return (this.contract as any).set_metadata(
      agentId,
      encodeStringAsByteArray(key),
      encodeStringAsByteArray(value),
    )
  }

  /**
   * Publishes a capability object under `capability:<name>` and updates the `caps` index.
   *
   * Convention:
   * - `caps` is a JSON array of strings (capability names)
   * - each `capability:<name>` value is JSON for the capability object
   */
  async publishCapability(args: { agentId: bigint; capability: AgentCapability }) {
    const { agentId, capability } = args
    if (!capability.name?.trim()) throw new Error("capability.name missing")

    const capsRaw = await this.getMetadata(agentId, PASSPORT_CAPS_KEY).catch(() => "")
    const caps = parseCapsList(capsRaw)
    const nextCaps = caps.includes(capability.name) ? caps : [...caps, capability.name]

    // 1) publish capability payload
    await this.setMetadata(agentId, capabilityKey(capability.name), JSON.stringify(capability))

    // 2) update index
    await this.setMetadata(agentId, PASSPORT_CAPS_KEY, stringifyCapsList(nextCaps))

    return { caps: nextCaps }
  }
}
