import { Account, CallData, RpcProvider, byteArray, cairo } from "starknet"
import { describe, expect, it, vi } from "vitest"
import { IdentityRegistryPassportClient } from "../src/index.js"

const REGISTRY = "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631"

describe("IdentityRegistryPassportClient", () => {
  const provider = new RpcProvider({ nodeUrl: "http://127.0.0.1:1" })

  it("sends writes through the account with ByteArray calldata", async () => {
    const account = new Account({ provider, address: "0x123", signer: "0x1" })
    const execute = vi.spyOn(account, "execute").mockResolvedValue({ transaction_hash: "0xabc" })

    const client = new IdentityRegistryPassportClient({
      identityRegistryAddress: REGISTRY,
      provider,
      account,
    })
    const res = await client.setMetadata(1n, "caps", "[]")

    expect(res).toEqual({ transaction_hash: "0xabc" })
    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.calls[0]?.[0]).toEqual({
      contractAddress: REGISTRY,
      entrypoint: "set_metadata",
      calldata: CallData.compile({
        agent_id: cairo.uint256(1n),
        key: byteArray.byteArrayFromString("caps"),
        value: byteArray.byteArrayFromString("[]"),
      }),
    })
  })

  it("reads metadata with a ByteArray key and decodes the ByteArray result", async () => {
    // Raw get_metadata(1, "agentName") result from the Sepolia IdentityRegistry
    const callContract = vi
      .spyOn(provider, "callContract")
      .mockResolvedValue(["0x0", "0x416c6963654167656e745632", "0xc"])

    const client = new IdentityRegistryPassportClient({ identityRegistryAddress: REGISTRY, provider })

    await expect(client.getMetadata(1n, "agentName")).resolves.toBe("AliceAgentV2")
    expect(callContract.mock.calls[0]?.[0]).toMatchObject({
      contractAddress: REGISTRY,
      entrypoint: "get_metadata",
      calldata: CallData.compile({
        agent_id: cairo.uint256(1n),
        key: byteArray.byteArrayFromString("agentName"),
      }),
    })
  })
})
