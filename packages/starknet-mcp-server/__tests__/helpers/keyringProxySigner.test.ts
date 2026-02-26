import { createHash, createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { num, outsideExecution, typedData } from "starknet";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyringProxySigner } from "../../src/helpers/keyringProxySigner.js";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function extractTraceId(requestInit?: RequestInit): string {
  const rawBody = requestInit?.body;
  if (typeof rawBody !== "string") {
    return "";
  }
  const parsed = JSON.parse(rawBody) as {
    context?: { requestId?: unknown; traceId?: unknown };
  };
  if (typeof parsed.context?.traceId === "string") {
    return parsed.context.traceId;
  }
  if (typeof parsed.context?.requestId === "string") {
    return parsed.context.requestId;
  }
  return "";
}

function buildAllowResponse(traceId: string): Record<string, unknown> {
  return {
    signature: ["0x123", "0xaaa", "0xbbb", "0x698f136c"],
    signatureMode: "v2_snip12",
    signatureKind: "Snip12",
    signerProvider: "dfns",
    sessionPublicKey: "0x123",
    domainHash: "0x1",
    messageHash: "0x2",
    requestId: traceId,
    audit: {
      policyDecision: "allow",
      decidedAt: "2026-02-13T12:00:00Z",
      keyId: "default",
      traceId,
    },
  };
}

function buildFetchJsonResponse(payload: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

describe("KeyringProxySigner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("matches canonical session-signature-v2 vector domain hash and runtime message hash", () => {
    const vectors = JSON.parse(
      fs.readFileSync(new URL("../../../../spec/session-signature-v2.json", import.meta.url), "utf8"),
    ) as {
      vectors: Array<{
        id: string;
        accountAddress: string;
        domain: { chainId: string };
        message: {
          caller: string;
          nonce: string;
          execute_after: string;
          execute_before: string;
          calls: Array<{ to: string; selector: string; calldata: string[] }>;
        };
        expected: { domainHash: string; messageHash: string };
      }>;
    };
    const vector = vectors.vectors.find((item) => item.id === "outside_execution_single_call_sepolia_v2");
    expect(vector).toBeDefined();
    const typed = outsideExecution.getTypedData(
      vector!.domain.chainId,
      {
        caller: vector!.message.caller,
        execute_after: vector!.message.execute_after,
        execute_before: BigInt(vector!.message.execute_before),
      },
      vector!.message.nonce,
      vector!.message.calls.map((call) => ({
        contractAddress: call.to,
        entrypoint: call.selector,
        calldata: call.calldata,
      })),
      "2",
    );
    const domainType = (typed as { types: Record<string, unknown> }).types.StarknetDomain
      ? "StarknetDomain"
      : "StarkNetDomain";
    const computedDomainHash = typedData.getStructHash(
      (typed as { types: Record<string, unknown> }).types as never,
      domainType,
      (typed as { domain: Record<string, unknown> }).domain as never,
      (typed as { domain?: { revision?: string } }).domain?.revision as never,
    );
    const computedMessageHash = typedData.getMessageHash(
      typed,
      num.toHex(BigInt(vector!.accountAddress)),
    );
    const expectedRuntimeMessageHash =
      "0x31a7322b5e322da06a35b192db191a1c218b6924a68e257bf15f92264ba8f09";

    expect(num.toHex(BigInt(computedDomainHash))).toBe(num.toHex(BigInt(vector!.expected.domainHash)));
    expect(num.toHex(BigInt(computedMessageHash))).toBe(expectedRuntimeMessageHash);
  });

  it("signs transactions through keyring proxy with HMAC headers", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      return buildFetchJsonResponse(buildAllowResponse(traceId));
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

    expect(signature).toEqual(["0x123", "0xaaa", "0xbbb", "0x698f136c"]);
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

  it("rejects proxy signatures that are not 4-felt session signatures", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      const payload = buildAllowResponse(traceId);
      payload.signature = ["0x123", "0xaaa", "0xbbb"];
      return buildFetchJsonResponse(payload);
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
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("expected [pubkey, r, s, valid_until]");
  });

  it("rejects proxy signatures when signatureMode is not v2_snip12", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      const payload = buildAllowResponse(traceId);
      payload.signatureMode = "v1";
      return buildFetchJsonResponse(payload);
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
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("signatureMode must be v2_snip12");
  });

  it.each([
    {
      label: "requestId is missing",
      mutate: (payload: Record<string, unknown>) => {
        delete payload.requestId;
      },
      expectedError: "requestId is required",
    },
    {
      label: "requestId is blank",
      mutate: (payload: Record<string, unknown>) => {
        payload.requestId = "   ";
      },
      expectedError: "requestId is required",
    },
    {
      label: "requestId does not match outbound traceId",
      mutate: (payload: Record<string, unknown>) => {
        payload.requestId = "different-request-id";
      },
      expectedError: "requestId does not match outbound request",
    },
    {
      label: "audit object is missing",
      mutate: (payload: Record<string, unknown>) => {
        delete payload.audit;
      },
      expectedError: "audit object is required",
    },
    {
      label: "audit.policyDecision is denied",
      mutate: (payload: Record<string, unknown>) => {
        const audit = payload.audit as Record<string, unknown>;
        audit.policyDecision = "deny";
      },
      expectedError: "audit.policyDecision must be allow",
    },
    {
      label: "audit.decidedAt is invalid",
      mutate: (payload: Record<string, unknown>) => {
        const audit = payload.audit as Record<string, unknown>;
        audit.decidedAt = "not-a-date";
      },
      expectedError: "audit.decidedAt must be an RFC3339 timestamp",
    },
    {
      label: "audit.decidedAt is not RFC3339",
      mutate: (payload: Record<string, unknown>) => {
        const audit = payload.audit as Record<string, unknown>;
        audit.decidedAt = "2026-02-13";
      },
      expectedError: "audit.decidedAt must be an RFC3339 timestamp",
    },
    {
      label: "audit.keyId is blank",
      mutate: (payload: Record<string, unknown>) => {
        const audit = payload.audit as Record<string, unknown>;
        audit.keyId = " ";
      },
      expectedError: "audit.keyId is required",
    },
    {
      label: "audit.traceId is blank",
      mutate: (payload: Record<string, unknown>) => {
        const audit = payload.audit as Record<string, unknown>;
        audit.traceId = " ";
      },
      expectedError: "audit.traceId is required",
    },
    {
      label: "audit.traceId does not match outbound traceId",
      mutate: (payload: Record<string, unknown>) => {
        const audit = payload.audit as Record<string, unknown>;
        audit.traceId = "different-trace-id";
      },
      expectedError: "audit.traceId does not match outbound traceId",
    },
  ])("rejects proxy signatures when $label", async ({ mutate, expectedError }) => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      const responsePayload = buildAllowResponse(traceId);
      mutate(responsePayload);
      return buildFetchJsonResponse(responsePayload);
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
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow(expectedError);
  });

  it("rejects proxy signatures when audit.keyId does not match requested keyId", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      const payload = buildAllowResponse(traceId);
      payload.audit = {
        ...(payload.audit as Record<string, unknown>),
        keyId: "different-key",
      };
      return buildFetchJsonResponse(payload);
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

    await expect(
      signer.signTransaction(
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("audit.keyId does not match requested keyId");
  });

  it("rejects proxy signatures when sessionPublicKey mismatches signature pubkey", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      const payload = buildAllowResponse(traceId);
      payload.sessionPublicKey = "0x456";
      payload.signature = ["0x123", "0xaaa", "0xbbb", "0xccc"];
      return buildFetchJsonResponse(payload);
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
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("sessionPublicKey does not match signature pubkey");
  });

  it("rejects proxy signatures when valid_until does not match requested window", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      const traceId = extractTraceId(requestInit);
      const payload = buildAllowResponse(traceId);
      payload.signature = ["0x123", "0xaaa", "0xbbb", "0x99999999"];
      return buildFetchJsonResponse(payload);
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
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
        { chainId: "0x1", nonce: "0x1" } as any
      )
    ).rejects.toThrow("signature valid_until does not match requested window");
  });

  it("rejects unexpected session pubkey changes across requests", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: URL, requestInit?: RequestInit) => {
      callCount += 1;
      const traceId = extractTraceId(requestInit);
      const payload = buildAllowResponse(traceId);
      if (callCount === 2) {
        payload.signature = ["0x456", "0xaaa", "0xbbb", "0x698f136c"];
        payload.sessionPublicKey = "0x456";
      }
      return buildFetchJsonResponse(payload);
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

    await signer.signTransaction(
      [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
      { chainId: "0x1", nonce: "0x1" } as any
    );

    await expect(
      signer.signTransaction(
        [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x2"] }],
        { chainId: "0x1", nonce: "0x2" } as any
      )
    ).rejects.toThrow("session public key changed unexpectedly");
  });

  it("rejects incomplete mTLS client configuration", async () => {
    expect(
      () =>
        new KeyringProxySigner({
          proxyUrl: "https://signer.internal:8545",
          hmacSecret: "test-secret",
          clientId: "mcp-tests",
          accountAddress: "0xabc",
          requestTimeoutMs: 5_000,
          sessionValiditySeconds: 300,
          tlsClientCertPath: "/tmp/cert.pem",
        })
    ).toThrow("Incomplete keyring mTLS client configuration");
  });

  it("uses mTLS transport when TLS client material is configured", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-keyring-mtls-"));
    const certPath = path.join(tempDir, "client.crt");
    const keyPath = path.join(tempDir, "client.key");
    const caPath = path.join(tempDir, "ca.crt");
    fs.writeFileSync(certPath, "client-cert");
    fs.writeFileSync(keyPath, "client-key");
    fs.writeFileSync(caPath, "ca-cert");

    const requestSpy = vi.spyOn(https, "request").mockImplementation(((options: any, callback: any) => {
      const response = new EventEmitter() as EventEmitter & { statusCode?: number };
      response.statusCode = 200;

      let requestBody = "";
      const req = new EventEmitter() as EventEmitter & {
        setTimeout: (ms: number, cb: () => void) => void;
        write: (chunk: string) => void;
        end: () => void;
        destroy: (err?: Error) => void;
      };
      req.setTimeout = vi.fn();
      req.write = vi.fn((chunk: string) => {
        requestBody += chunk;
      });
      req.end = vi.fn(() => {
        callback(response);
        const parsedRequest = JSON.parse(requestBody) as {
          context?: { requestId?: string; traceId?: string };
        };
        const traceId = parsedRequest.context?.traceId ?? parsedRequest.context?.requestId ?? "";
        response.emit("data", Buffer.from(JSON.stringify(buildAllowResponse(traceId))));
        response.emit("end");
      });
      req.destroy = vi.fn();
      return req as any;
    }) as any);

    const signer = new KeyringProxySigner({
      proxyUrl: "https://signer.internal:8545",
      hmacSecret: "test-secret",
      clientId: "mcp-tests",
      accountAddress: "0xabc",
      requestTimeoutMs: 5_000,
      sessionValiditySeconds: 300,
      tlsClientCertPath: certPath,
      tlsClientKeyPath: keyPath,
      tlsCaPath: caPath,
    });

    const signature = await signer.signTransaction(
      [{ contractAddress: "0x111", entrypoint: "transfer", calldata: ["0x1"] }],
      { chainId: "0x1", nonce: "0x1" } as any
    );

    expect(signature).toEqual(["0x123", "0xaaa", "0xbbb", "0x698f136c"]);
    expect(requestSpy).toHaveBeenCalledTimes(1);

    const requestOptions = requestSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(requestOptions.cert).toBeInstanceOf(Buffer);
    expect(requestOptions.key).toBeInstanceOf(Buffer);
    expect(requestOptions.ca).toBeInstanceOf(Buffer);
    expect(requestOptions.rejectUnauthorized).toBe(true);
  });
});
