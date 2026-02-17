import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
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
  tlsClientCertPath?: string;
  tlsClientKeyPath?: string;
  tlsCaPath?: string;
};

type KeyringSignResponse = {
  signature: unknown[];
  signatureMode: "v2_snip12";
  signatureKind: "Snip12";
  signerProvider?: "local" | "dfns";
  sessionPublicKey?: string;
  domainHash: string;
  requestId?: string;
  messageHash: string;
};

type MtlsClientMaterial = {
  cert: Buffer;
  key: Buffer;
  ca: Buffer;
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

function isHexFelt(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
}

function feltEqualsHex(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

export class KeyringProxySigner extends SignerInterface {
  private readonly endpointPath = "/v1/sign/session-transaction";
  private readonly config: KeyringProxySignerConfig;
  private cachedSessionPublicKey?: string;
  private readonly mtlsClientMaterial?: MtlsClientMaterial;

  constructor(config: KeyringProxySignerConfig) {
    super();
    this.config = config;
    const hasMtlsField = Boolean(
      config.tlsClientCertPath || config.tlsClientKeyPath || config.tlsCaPath
    );
    if (hasMtlsField) {
      if (!config.tlsClientCertPath || !config.tlsClientKeyPath || !config.tlsCaPath) {
        throw new Error(
          "Incomplete keyring mTLS client configuration; set tlsClientCertPath, tlsClientKeyPath, and tlsCaPath"
        );
      }
      const proxyProtocol = new URL(config.proxyUrl).protocol;
      if (proxyProtocol !== "https:") {
        throw new Error("mTLS client certificates require an https KEYRING_PROXY_URL");
      }

      this.mtlsClientMaterial = {
        cert: fs.readFileSync(config.tlsClientCertPath),
        key: fs.readFileSync(config.tlsClientKeyPath),
        ca: fs.readFileSync(config.tlsCaPath),
      };
    }
  }

  private async postJsonViaMtls(
    url: URL,
    headers: Record<string, string>,
    body: string
  ): Promise<{ status: number; bodyText: string }> {
    if (!this.mtlsClientMaterial) {
      throw new Error("Internal error: mTLS material not initialized");
    }

    return await new Promise((resolve, reject) => {
      const request = https.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          method: "POST",
          headers,
          cert: this.mtlsClientMaterial.cert,
          key: this.mtlsClientMaterial.key,
          ca: this.mtlsClientMaterial.ca,
          rejectUnauthorized: true,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              bodyText: Buffer.concat(chunks).toString("utf8"),
            });
          });
        }
      );

      request.setTimeout(this.config.requestTimeoutMs, () => {
        const timeoutError = new Error("request timeout");
        timeoutError.name = "AbortError";
        request.destroy(timeoutError);
      });

      request.on("error", reject);
      request.write(body);
      request.end();
    });
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
    const requestedValidUntilHex = num.toHex(validUntil);
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
      const requestHeaders = {
        "content-type": "application/json",
        "x-keyring-client-id": this.config.clientId,
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": hmacHex,
      };

      let responseStatus: number;
      let responseBodyText: string;
      if (this.mtlsClientMaterial) {
        const mtlsResponse = await this.postJsonViaMtls(url, requestHeaders, rawBody);
        responseStatus = mtlsResponse.status;
        responseBodyText = mtlsResponse.bodyText;
      } else {
        const response = await fetch(url, {
          method: "POST",
          headers: requestHeaders,
          body: rawBody,
          signal: controller.signal,
        });
        responseStatus = response.status;
        if (typeof response.text === "function") {
          responseBodyText = await response.text();
        } else {
          responseBodyText = JSON.stringify(await response.json());
        }
      }

      if (responseStatus < 200 || responseStatus >= 300) {
        throw new Error(formatProxyError(responseStatus, responseBodyText));
      }

      const parsed = JSON.parse(responseBodyText) as KeyringSignResponse;
      // SECURITY-SENSITIVE SIGNER BOUNDARY VALIDATION:
      // Enforces KeyringSignResponse invariants from SISNA before the client
      // accepts a proxy signature. Changes here require explicit human security
      // review and cross-repo compatibility verification (SISNA + starkclaw).
      if (parsed.signatureMode !== "v2_snip12") {
        throw new Error(
          "Invalid signature response from keyring proxy: signatureMode must be v2_snip12"
        );
      }
      if (parsed.signatureKind !== "Snip12") {
        throw new Error(
          "Invalid signature response from keyring proxy: signatureKind must be Snip12"
        );
      }
      if (!isHexFelt(parsed.domainHash) || !isHexFelt(parsed.messageHash)) {
        throw new Error(
          "Invalid signature response from keyring proxy: missing domainHash/messageHash"
        );
      }
      if (parsed.signerProvider !== undefined && parsed.signerProvider !== "local" && parsed.signerProvider !== "dfns") {
        throw new Error(
          "Invalid signature response from keyring proxy: signerProvider must be local or dfns"
        );
      }
      if (!Array.isArray(parsed.signature) || parsed.signature.length !== 4) {
        throw new Error(
          "Invalid signature response from keyring proxy: expected [pubkey, r, s, valid_until]"
        );
      }
      if (!parsed.signature.every(isHexFelt)) {
        throw new Error("Invalid signature response from keyring proxy: signature felts must be hex");
      }
      const normalizedSignature = parsed.signature.map((felt) => num.toHex(BigInt(felt)));
      const signaturePubKey = normalizedSignature[0];
      const signatureValidUntil = normalizedSignature[3];
      const resolvedSessionPublicKey = parsed.sessionPublicKey
        ? num.toHex(BigInt(parsed.sessionPublicKey))
        : signaturePubKey;

      if (parsed.sessionPublicKey && !feltEqualsHex(parsed.sessionPublicKey, signaturePubKey)) {
        throw new Error(
          "Invalid signature response from keyring proxy: sessionPublicKey does not match signature pubkey"
        );
      }
      if (!feltEqualsHex(signatureValidUntil, requestedValidUntilHex)) {
        throw new Error(
          "Invalid signature response from keyring proxy: signature valid_until does not match requested window"
        );
      }
      if (
        this.cachedSessionPublicKey &&
        !feltEqualsHex(this.cachedSessionPublicKey, resolvedSessionPublicKey)
      ) {
        throw new Error(
          "Invalid signature response from keyring proxy: session public key changed unexpectedly"
        );
      }
      this.cachedSessionPublicKey = resolvedSessionPublicKey;

      return normalizedSignature;
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
