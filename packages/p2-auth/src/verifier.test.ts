import { describe, it, expect, vi } from "vitest";
import { verifySISNACredentials, buildSISNATypedData } from "./verifier.js";
import type { ERC8004RegistryClient, SISNAMessage, SISNASignature } from "./types.js";

const mockRegistryClient: ERC8004RegistryClient = {
  isAgentOwner: vi.fn(),
  getRegistryAddress: () => "0x0123456789ABCDEF",
};

const sampleMessage: SISNAMessage = {
  address: "0x0123",
  nonce: "abc123",
  statement: "Sign in",
  domain: "TestDomain",
  version: "1",
};

const sampleSignature: SISNASignature = {
  r: "0xrrr",
  s: "0xsss",
  v: 0,
};

describe("buildSISNATypedData", () => {
  it("produces a structured typed data object", () => {
    const data = buildSISNATypedData(sampleMessage);
    expect(data).toHaveProperty("types");
    expect(data).toHaveProperty("primaryType", "SISNAChallenge");
    expect(data).toHaveProperty("domain");
    expect(data).toHaveProperty("message");
  });

  it("includes the nonce in the message", () => {
    const data = buildSISNATypedData(sampleMessage);
    expect((data as any).message.nonce).toBe("abc123");
  });
});

describe("verifySISNACredentials", () => {
  it("returns verified receipt when agent is owner", async () => {
    vi.mocked(mockRegistryClient.isAgentOwner).mockResolvedValue(true);

    const receipt = await verifySISNACredentials(
      sampleMessage,
      sampleSignature,
      mockRegistryClient,
    );

    expect(receipt.verified).toBe(true);
    expect(receipt.isAgentOwner).toBe(true);
    expect(receipt.registryAddress).toBe("0x0123456789ABCDEF");
    expect(receipt.nonce).toBe("abc123");
    expect(receipt.address).toBe("0x0123");
    expect(receipt.signature).toEqual(sampleSignature);
  });

  it("returns unverified receipt when agent is not owner", async () => {
    vi.mocked(mockRegistryClient.isAgentOwner).mockResolvedValue(false);

    const receipt = await verifySISNACredentials(
      sampleMessage,
      sampleSignature,
      mockRegistryClient,
    );

    expect(receipt.verified).toBe(false);
    expect(receipt.isAgentOwner).toBe(false);
  });

  it("handles registry client errors gracefully", async () => {
    vi.mocked(mockRegistryClient.isAgentOwner).mockRejectedValue(
      new Error("Registry unavailable"),
    );

    const receipt = await verifySISNACredentials(
      sampleMessage,
      sampleSignature,
      mockRegistryClient,
    );

    // Should still return a receipt, marked unverified due to failure
    expect(receipt).toHaveProperty("address");
    expect(receipt).toHaveProperty("verified");
  });
});
