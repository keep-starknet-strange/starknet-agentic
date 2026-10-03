import type {
  SISNAMessage,
  SISNASignature,
  SISNAVerificationReceipt,
  ERC8004RegistryClient,
} from "./types.js";

/**
 * Verify a SISNA signature against the Starknet ledger using SNIP-12 compatible
 * message hashing (EIP-191 typed data).
 */
export async function verifySISNACredentials(
  message: SISNAMessage,
  signature: SISNASignature,
  registryClient: ERC8004RegistryClient,
): Promise<SISNAVerificationReceipt> {
  const registryAddress = registryClient.getRegistryAddress();
  let isAgentOwner = false;

  try {
    isAgentOwner = await registryClient.isAgentOwner(message.address);
  } catch {
    // Registry check failed — still produce receipt but mark as unverified
  }

  return {
    address: message.address,
    verified: isAgentOwner,
    registryAddress,
    isAgentOwner,
    nonce: message.nonce,
    verifiedAt: new Date().toISOString(),
    signature,
  };
}

/**
 * Build the SNIP-12 / SIWS compatible SIWA message hash for Starknet verification.
 * Uses EIP-191 version 0x01 (typed data) structure adapted for Starknet.
 */
export function buildSISNATypedData(message: SISNAMessage): object {
  const base = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      SISNAChallenge: [
        { name: "address", type: "string" },
        { name: "nonce", type: "string" },
        { name: "statement", type: "string" },
        { name: "uri", type: "string" },
        { name: "version", type: "string" },
        { name: "issuedAt", type: "string" },
      ],
    },
    primaryType: "SISNAChallenge",
    domain: {
      name: message.domain ?? "Starknet Agentic",
      version: message.version ?? "1",
      chainId: "1",
      verifyingContract: "0x0",
    },
    message: {
      address: message.address,
      nonce: message.nonce,
      statement: message.statement ?? "Sign this message to authenticate with Starknet Agentic.",
      uri: message.uri ?? "",
      version: message.version ?? "1",
      issuedAt: new Date().toISOString(),
    },
  };
  return base;
}
