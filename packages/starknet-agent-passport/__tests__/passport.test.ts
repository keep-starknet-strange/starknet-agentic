import { describe, expect, it } from "vitest"
import {
  capabilityKey,
  parseCapsList,
  stringifyCapsList,
} from "../src/index.js"

describe("agent-passport", () => {
  it("builds capability keys", () => {
    expect(capabilityKey("swap")).toBe("capability:swap")
    expect(() => capabilityKey(" ")).toThrow(/empty/i)
  })

  it("parses and stringifies caps list", () => {
    expect(parseCapsList(undefined)).toEqual([])
    expect(parseCapsList("\n")).toEqual([])

    const names = parseCapsList(JSON.stringify(["a", "b", "a"]))
    expect(names).toEqual(["a", "b"])

    expect(stringifyCapsList(["a", "b", "a", " "])).toBe(JSON.stringify(["a", "b"]))
  })

  it("rejects invalid caps metadata", () => {
    expect(() => parseCapsList(JSON.stringify({ a: 1 }))).toThrow(/must be a JSON array/i)
    expect(() => parseCapsList(JSON.stringify([1]))).toThrow(/must be strings/i)
  })
})
