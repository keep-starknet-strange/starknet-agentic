export interface SISNANonce {
  /** Unique nonce string */
  nonce: string;
  /** Unix timestamp (seconds) when the nonce expires */
  expiresAt: number;
  /** Unix timestamp (seconds) when the nonce was issued */
  issuedAt: number;
}

export interface SISNAMessage {
  /** Starknet account contract address (hex, 0x-prefixed) */
  address: string;
  /** The nonce challenge string */
  nonce: string;
  /** ISO 8601 timestamp of signing */
  statement?: string;
  /** Domain for EIP-712 style separation */
  domain?: string;
  /** Version string */
  version?: string;
  /** URI of the service */
  uri?: string;
}

export interface SISNASignature {
  /** ECDSA signature r component (hex) */
  r: string;
  /** ECDSA signature s component (hex) */
  s: string;
  /** Recovery id (0, 1, or 2) */
  recovery?: number;
  /** SNIP-12 v flag: 0 or 1 */
  v?: number;
}

export interface SISNAVerificationReceipt {
  /** The verified address */
  address: string;
  /** Whether verification succeeded */
  verified: boolean;
  /** ERC-8004 registry contract address (optional) */
  registryAddress?: string;
  /** Whether the address is an agent owner per ERC-8004 */
  isAgentOwner: boolean;
  /** The original nonce used */
  nonce: string;
  /** ISO timestamp of verification */
  verifiedAt: string;
  /** Signature used for verification */
  signature: SISNASignature;
}

export interface NonceStore {
  get(nonce: string): SISNANonce | null;
  set(nonce: string, data: SISNANonce): void;
  invalidate(nonce: string): void;
  cleanup(): void;
}

export interface ERC8004RegistryClient {
  /** Check if an address owns/operates an agent in the registry */
  isAgentOwner(address: string): Promise<boolean>;
  /** Get the registry contract address */
  getRegistryAddress(): string;
}

export interface SISNAConfig {
  /** Nonce TTL in seconds (default: 300) */
  nonceTTL?: number;
  /** ERC-8004 registry client */
  registryClient: ERC8004RegistryClient;
  /** Custom nonce store (defaults to in-memory) */
  nonceStore?: NonceStore;
  /** Domain for message signing */
  domain?: string;
  /** Service URI */
  uri?: string;
}
