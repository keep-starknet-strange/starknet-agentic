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

/** Standard capability categories for Agent Passport */
export const CAPABILITY_CATEGORIES = [
  "defi",
  "trading",
  "identity",
  "messaging",
  "payments",
  "prediction",
] as const

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]

export type PassportCapability = {
  name: string
  category: CapabilityCategory
  version?: string
  description?: string
  endpoint?: string
}

export type AgentPassport = {
  capabilities: PassportCapability[]
}

/**
 * Validates an Agent Passport object against the schema.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validatePassport(data: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []

  if (data == null || typeof data !== "object") {
    return { valid: false, errors: ["Passport must be an object"] }
  }

  const obj = data as Record<string, unknown>

  if (!Array.isArray(obj.capabilities)) {
    return { valid: false, errors: ["'capabilities' must be an array"] }
  }

  if (obj.capabilities.length === 0) {
    return { valid: false, errors: ["'capabilities' must have at least one entry"] }
  }

  const validCategories = new Set<string>(CAPABILITY_CATEGORIES)
  const namePattern = /^[a-z][a-z0-9-]*$/

  for (let i = 0; i < obj.capabilities.length; i++) {
    const cap = obj.capabilities[i]
    const prefix = `capabilities[${i}]`

    if (cap == null || typeof cap !== "object") {
      errors.push(`${prefix}: must be an object`)
      continue
    }

    const c = cap as Record<string, unknown>

    if (typeof c.name !== "string" || !c.name) {
      errors.push(`${prefix}.name: required string`)
    } else if (!namePattern.test(c.name)) {
      errors.push(`${prefix}.name: must match pattern ^[a-z][a-z0-9-]*$`)
    } else if (c.name.length > 64) {
      errors.push(`${prefix}.name: max 64 characters`)
    }

    if (typeof c.category !== "string" || !validCategories.has(c.category)) {
      errors.push(`${prefix}.category: must be one of ${CAPABILITY_CATEGORIES.join(", ")}`)
    }

    if (c.version !== undefined && (typeof c.version !== "string" || !/^\d+\.\d+(\.\d+)?$/.test(c.version))) {
      errors.push(`${prefix}.version: must match pattern ^\\d+\\.\\d+(\\.\\d+)?$`)
    }

    if (c.description !== undefined && (typeof c.description !== "string" || c.description.length > 256)) {
      errors.push(`${prefix}.description: must be a string (max 256 chars)`)
    }

    if (c.endpoint !== undefined && typeof c.endpoint !== "string") {
      errors.push(`${prefix}.endpoint: must be a string`)
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true }
}

export function capabilityKey(name: string): string {
  if (!name.trim()) throw new Error("Capability name is empty")
  return `capability:${name}`
}

export function encodeStringAsByteArray(v: string) {
  return byteArray.byteArrayFromString(v)
}

export function decodeByteArrayAsString(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- starknet.js Contract constructor accepts Abi type which is loosely typed
    this.contract = new Contract({
      abi: identityRegistryAbi as any,
      address: args.identityRegistryAddress,
      providerOrAccount: args.provider,
    })
    if (args.account) this.contract.connect(args.account)
  }

  async agentExists(agentId: bigint): Promise<boolean> {
    const res = await this.contract.call("agent_exists", [agentId])
    return Boolean(res)
  }

  async getMetadata(agentId: bigint, key: string): Promise<string> {
    const res = await this.contract.call("get_metadata", [agentId, encodeStringAsByteArray(key)])
    return decodeByteArrayAsString(res)
  }

  async setMetadata(agentId: bigint, key: string, value: string) {
    return this.contract.invoke("set_metadata", [
      agentId,
      encodeStringAsByteArray(key),
      encodeStringAsByteArray(value),
    ])
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
