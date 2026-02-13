import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  type Call,
  type DeclareSignerDetails,
  type DeployAccountSignerDetails,
  type InvocationsSignerDetails,
  type Signature,
  type TypedData,
  SignerInterface,
  num,
} from "starknet";

export type StarknetSignerMode = "direct" | "proxy";

type KeyringProxySignerConfig = {
  proxyUrl: string;
  hmacSecret: string;
  clientId: string;
  accountAddress: string;
  requestTimeoutMs: number;
  sessionValiditySeconds: number;
  keyId?: string;
};

type KeyringSignResponse = {
  signature: string[];
  sessionPublicKey?: string;
  requestId?: string;
  messageHash?: string;
};

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildHmacPayload(args: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  rawBody: string;
}): string {
  return `${args.timestamp}.${args.nonce}.${args.method.toUpperCase()}.${args.path}.${sha256Hex(args.rawBody)}`;
}

function toFeltHex(value: string | bigint | number): string {
  if (typeof value === "string" && value.startsWith("0x")) {
    return value;
  }

  return num.toHex(value as string | bigint | number);
}

function formatProxyError(status: number, rawText: string): string {
  if (!rawText) {
    return `Keyring proxy error (${status})`;
  }
  try {
    const parsed = JSON.parse(rawText) as { error?: string };
    if (parsed.error) {
      return `Keyring proxy error (${status}): ${parsed.error}`;
    }
  } catch {
    // Fall through to raw string.
  }
  return `Keyring proxy error (${status}): ${rawText}`;
}

export class KeyringProxySigner extends SignerInterface {
  private readonly endpointPath = "/v1/sign/session-transaction";
  private readonly config: KeyringProxySignerConfig;
  private cachedSessionPublicKey?: string;

  constructor(config: KeyringProxySignerConfig) {
    super();
    this.config = config;
  }

  async getPubKey(): Promise<string> {
    if (this.cachedSessionPublicKey) {
      return this.cachedSessionPublicKey;
    }
    throw new Error("Session public key unavailable before first successful proxy signature");
  }

  async signMessage(_typedData: TypedData, _accountAddress: string): Promise<Signature> {
    throw new Error("KeyringProxySigner does not support signMessage");
  }

  async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    const validUntil = Math.floor(Date.now() / 1000) + this.config.sessionValiditySeconds;
    const requestPayload = {
      accountAddress: this.config.accountAddress,
      keyId: this.config.keyId,
      chainId: toFeltHex(transactionsDetail.chainId),
      nonce: toFeltHex(transactionsDetail.nonce),
      validUntil,
      calls: transactions.map((call) => ({
        contractAddress: call.contractAddress,
        entrypoint: call.entrypoint,
        calldata: (call.calldata ?? []).map((value) =>
          typeof value === "string" ? value : num.toHex(value)
        ),
      })),
      context: {
        requester: "starknet-mcp-server",
        tool: "account.execute",
        reason: "transaction signing request",
      },
    };

    const rawBody = JSON.stringify(requestPayload);
    const timestamp = Date.now().toString();
    const nonce = randomBytes(16).toString("hex");
    const url = new URL(this.endpointPath, this.config.proxyUrl);
    const signingPayload = buildHmacPayload({
      timestamp,
      nonce,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      rawBody,
    });
    const hmacHex = createHmac("sha256", this.config.hmacSecret).update(signingPayload).digest("hex");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-keyring-client-id": this.config.clientId,
          "x-keyring-timestamp": timestamp,
          "x-keyring-nonce": nonce,
          "x-keyring-signature": hmacHex,
        },
        body: rawBody,
        signal: controller.signal,
      });

      if (!response.ok) {
        const rawText = await response.text();
        throw new Error(formatProxyError(response.status, rawText));
      }

      const parsed = (await response.json()) as KeyringSignResponse;
      if (!Array.isArray(parsed.signature) || parsed.signature.length < 2) {
        throw new Error("Invalid signature response from keyring proxy");
      }
      if (parsed.sessionPublicKey) {
        this.cachedSessionPublicKey = parsed.sessionPublicKey;
      }

      return parsed.signature;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Keyring proxy request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async signDeployAccountTransaction(
    _transaction: DeployAccountSignerDetails
  ): Promise<Signature> {
    throw new Error("KeyringProxySigner cannot sign deploy account transactions");
  }

  async signDeclareTransaction(_transaction: DeclareSignerDetails): Promise<Signature> {
    throw new Error("KeyringProxySigner cannot sign declare transactions");
  }
}
