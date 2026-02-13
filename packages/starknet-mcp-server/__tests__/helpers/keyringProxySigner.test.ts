import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyringProxySigner } from "../../src/helpers/keyringProxySigner.js";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("KeyringProxySigner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("signs transactions through keyring proxy with HMAC headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        signature: ["0x123", "0xaaa", "0xbbb", "0xccc"],
        sessionPublicKey: "0x123",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const signer = new KeyringProxySigner({
      proxyUrl: "http://127.0.0.1:8545",
      hmacSecret: "test-secret",
      clientId: "mcp-tests",
      accountAddress: "0xabc",
      requestTimeoutMs: 5_000,
      sessionValiditySeconds: 300,
      keyId: "default",
    });

    const signature = await signer.signTransaction(
      [
        {
          contractAddress: "0x111",
          entrypoint: "transfer",
          calldata: ["0x1", "0x2"],
        },
      ],
      {
        chainId: "0x534e5f5345504f4c4941",
        nonce: "0x2",
      } as any
    );

    expect(signature).toEqual(["0x123", "0xaaa", "0xbbb", "0xccc"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("http://127.0.0.1:8545/v1/sign/session-transaction");
    expect(requestInit.method).toBe("POST");

    const headers = requestInit.headers as Record<string, string>;
    const rawBody = requestInit.body as string;
    const body = JSON.parse(rawBody);
    expect(body.accountAddress).toBe("0xabc");
    expect(body.keyId).toBe("default");
    expect(body.validUntil).toBe(1_770_984_300);
    expect(body.calls).toEqual([
      {
        contractAddress: "0x111",
        entrypoint: "transfer",
        calldata: ["0x1", "0x2"],
      },
    ]);

    const expectedPayload =
      `${headers["x-keyring-timestamp"]}.${headers["x-keyring-nonce"]}.POST.` +
      `/v1/sign/session-transaction.${sha256Hex(rawBody)}`;
    const expectedHmac = createHmac("sha256", "test-secret").update(expectedPayload).digest("hex");

    expect(headers["x-keyring-client-id"]).toBe("mcp-tests");
    expect(headers["x-keyring-signature"]).toBe(expectedHmac);
  });

  it("surfaces keyring proxy policy errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error: "selector denied" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const signer = new KeyringProxySigner({
      proxyUrl: "http://127.0.0.1:8545",
      hmacSecret: "test-secret",
      clientId: "mcp-tests",
      accountAddress: "0xabc",
      requestTimeoutMs: 5_000,
      sessionValiditySeconds: 300,
    });

    await expect(
      signer.signTransaction(
        [{ contractAddress: "0x111", entrypoint: "set_agent_id", calldata: [] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("selector denied");
  });

  it("returns timeout error when proxy request aborts", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const signer = new KeyringProxySigner({
      proxyUrl: "http://127.0.0.1:8545",
      hmacSecret: "test-secret",
      clientId: "mcp-tests",
      accountAddress: "0xabc",
      requestTimeoutMs: 5_000,
      sessionValiditySeconds: 300,
    });

    await expect(
      signer.signTransaction(
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("Keyring proxy request timed out");
  });
});
