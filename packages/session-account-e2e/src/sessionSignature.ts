/**
 * Session-key signing for SessionAccount (contracts/session-account).
 *
 * SessionAccount.__validate__ treats a transaction as session-signed only when the
 * signature has four felts, [session_pubkey, r, s, valid_until], and r/s sign the
 * session message hash for the account's session signature mode:
 *
 *   payload = [account, chain_id, nonce, valid_until,
 *              for each call: to, selector, calldata_len, ...calldata]
 *   v1 (mode 1): poseidon(payload)
 *   v2 (mode 2): poseidon(['StarkNet Message', domain_hash, account, poseidon(payload)])
 *     domain_hash = poseidon([STARKNET_DOMAIN_TYPE_HASH_REV1, 'Session.transaction', 2, chain_id, 1])
 *
 * This mirrors `_session_message_hash_v1` / `_session_message_hash_v2` in
 * contracts/session-account/src/account.cairo. The hash functions are pinned to the
 * `sessionVectors` in spec/session-signature-v2.json by this package's tests, and the
 * contract is pinned to the same vectors by the session-account snforge suite.
 */
import { SignerInterface, constants, ec, hash, num, shortString, transaction } from "starknet";
import type {
  BigNumberish,
  Call,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  Signature,
  TypedData,
} from "starknet";

export const SESSION_SIGNATURE_MODE_V1 = 1;
export const SESSION_SIGNATURE_MODE_V2 = 2;
export type SessionSignatureMode =
  | typeof SESSION_SIGNATURE_MODE_V1
  | typeof SESSION_SIGNATURE_MODE_V2;

const STARKNET_DOMAIN_TYPE_HASH_REV1 =
  "0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210";
const STARKNET_MESSAGE_PREFIX = shortString.encodeShortString("StarkNet Message");
const SESSION_DOMAIN_NAME = shortString.encodeShortString("Session.transaction");
const SESSION_DOMAIN_VERSION = 2n;
const SESSION_DOMAIN_REVISION = 1n;
const U64_MAX = 2n ** 64n - 1n;

export interface SessionCall {
  to: BigNumberish;
  selector: BigNumberish;
  calldata: BigNumberish[];
}

export interface SessionMessage {
  accountAddress: BigNumberish;
  chainId: BigNumberish;
  nonce: BigNumberish;
  validUntil: BigNumberish;
  calls: SessionCall[];
}

function toFelt(value: BigNumberish, label: string): bigint {
  const felt = BigInt(value);
  if (felt < 0n || felt >= constants.PRIME) {
    throw new Error(`${label} is not a valid felt: ${value}`);
  }
  return felt;
}

/**
 * The contract reads valid_until with `felt252 -> u64` try_into and rejects the
 * transaction when that fails, so anything outside (0, u64::MAX] can never verify.
 */
function toValidUntil(value: BigNumberish): bigint {
  const validUntil = BigInt(value);
  if (validUntil <= 0n || validUntil > U64_MAX) {
    throw new Error(`valid_until must be in (0, 2^64 - 1], got ${value}`);
  }
  return validUntil;
}

/** Maps the value returned by `get_session_signature_mode()` to a supported mode. */
export function parseSessionSignatureMode(value: BigNumberish): SessionSignatureMode {
  const mode = BigInt(value);
  if (mode === 1n) return SESSION_SIGNATURE_MODE_V1;
  if (mode === 2n) return SESSION_SIGNATURE_MODE_V2;
  throw new Error(`Unsupported session signature mode ${value}; expected 1 (v1) or 2 (v2)`);
}

/** Flattens a session message into the felts hashed by `_session_message_hash_v1`. */
export function sessionPayloadElements(message: SessionMessage): bigint[] {
  const elements = [
    toFelt(message.accountAddress, "accountAddress"),
    toFelt(message.chainId, "chainId"),
    toFelt(message.nonce, "nonce"),
    toValidUntil(message.validUntil),
  ];
  message.calls.forEach((call, index) => {
    elements.push(
      toFelt(call.to, `calls[${index}].to`),
      toFelt(call.selector, `calls[${index}].selector`),
      BigInt(call.calldata.length),
      ...call.calldata.map((item, j) => toFelt(item, `calls[${index}].calldata[${j}]`)),
    );
  });
  return elements;
}

export function sessionMessageHashV1(message: SessionMessage): string {
  return num.toHex(hash.computePoseidonHashOnElements(sessionPayloadElements(message)));
}

export function sessionDomainHashV2(chainId: BigNumberish): string {
  return num.toHex(
    hash.computePoseidonHashOnElements([
      STARKNET_DOMAIN_TYPE_HASH_REV1,
      SESSION_DOMAIN_NAME,
      SESSION_DOMAIN_VERSION,
      toFelt(chainId, "chainId"),
      SESSION_DOMAIN_REVISION,
    ]),
  );
}

export function sessionMessageHashV2(message: SessionMessage): string {
  return num.toHex(
    hash.computePoseidonHashOnElements([
      STARKNET_MESSAGE_PREFIX,
      sessionDomainHashV2(message.chainId),
      toFelt(message.accountAddress, "accountAddress"),
      sessionMessageHashV1(message),
    ]),
  );
}

export function sessionMessageHash(mode: SessionSignatureMode, message: SessionMessage): string {
  return mode === SESSION_SIGNATURE_MODE_V1
    ? sessionMessageHashV1(message)
    : sessionMessageHashV2(message);
}

/**
 * Decodes Cairo 1 `__execute__` calldata (a serialized `Array<Call>`) back into calls.
 * Strict: rejects truncated input and trailing felts.
 */
export function decodeExecuteCalldata(calldata: BigNumberish[]): SessionCall[] {
  const felts = calldata.map((item) => BigInt(item));
  let cursor = 0;
  const read = (): bigint => {
    if (cursor >= felts.length) throw new Error("Malformed __execute__ calldata: truncated");
    return felts[cursor++];
  };

  const count = read();
  if (count > BigInt(felts.length)) {
    throw new Error(`Malformed __execute__ calldata: call count ${count} exceeds calldata length`);
  }
  const calls: SessionCall[] = [];
  for (let i = 0n; i < count; i++) {
    const to = read();
    const selector = read();
    const length = read();
    if (length > BigInt(felts.length - cursor)) {
      throw new Error("Malformed __execute__ calldata: truncated call data");
    }
    calls.push({ to, selector, calldata: felts.slice(cursor, cursor + Number(length)) });
    cursor += Number(length);
  }
  if (cursor !== felts.length) {
    throw new Error("Malformed __execute__ calldata: trailing felts");
  }
  return calls;
}

/** Returns the 4-felt session signature [session_pubkey, r, s, valid_until]. */
export function signSessionMessageHash(
  privateKey: string,
  publicKey: BigNumberish,
  validUntil: BigNumberish,
  msgHash: string,
): string[] {
  const { r, s } = ec.starkCurve.sign(msgHash, privateKey);
  return [num.toHex(publicKey), num.toHex(r), num.toHex(s), num.toHex(toValidUntil(validUntil))];
}

export interface SessionAccountSignerOptions {
  /** Session private key (hex). Must match `publicKey`. */
  privateKey: string;
  /** Session public key registered with `add_or_update_session_key`. */
  publicKey: BigNumberish;
  /** valid_until placed in the signature (unix seconds, u64). */
  validUntil: BigNumberish;
  /** The account's `get_session_signature_mode()`. */
  mode: SessionSignatureMode;
}

/**
 * starknet.js signer that produces SessionAccount session signatures for INVOKE
 * transactions. Use it with `new Account({ ..., signer, cairoVersion: "1" })`.
 *
 * The hash covers the calls decoded from the exact `__execute__` calldata starknet.js
 * sends, so the signed calls cannot drift from the submitted ones.
 */
export class SessionAccountSigner extends SignerInterface {
  readonly #privateKey: string;
  readonly publicKey: string;
  readonly validUntil: bigint;
  readonly mode: SessionSignatureMode;

  constructor(options: SessionAccountSignerOptions) {
    super();
    let derivedPublicKey: string;
    try {
      derivedPublicKey = ec.starkCurve.getStarkKey(options.privateKey);
    } catch {
      // Do not surface the library error: it may quote the malformed key.
      throw new Error("Session private key is not a valid Stark private key");
    }
    if (BigInt(derivedPublicKey) !== BigInt(options.publicKey)) {
      throw new Error("Session private key does not match the session public key");
    }
    this.#privateKey = options.privateKey;
    this.publicKey = num.toHex(options.publicKey);
    this.validUntil = toValidUntil(options.validUntil);
    this.mode = parseSessionSignatureMode(options.mode);
  }

  async getPubKey(): Promise<string> {
    return this.publicKey;
  }

  async signTransaction(
    transactions: Call[],
    details: InvocationsSignerDetails,
  ): Promise<Signature> {
    if (details.cairoVersion !== "1") {
      throw new Error(
        `SessionAccount is a Cairo 1 account; expected cairoVersion "1", got "${details.cairoVersion}"`,
      );
    }
    const calls = decodeExecuteCalldata(
      transaction.getExecuteCalldata(transactions, details.cairoVersion),
    );
    const msgHash = sessionMessageHash(this.mode, {
      accountAddress: details.walletAddress,
      chainId: details.chainId,
      nonce: details.nonce,
      validUntil: this.validUntil,
      calls,
    });
    return signSessionMessageHash(this.#privateKey, this.publicKey, this.validUntil, msgHash);
  }

  async signMessage(_typedData: TypedData, _accountAddress: string): Promise<Signature> {
    throw new Error("SessionAccountSigner only signs INVOKE transactions");
  }

  async signDeployAccountTransaction(_details: DeployAccountSignerDetails): Promise<Signature> {
    throw new Error("SessionAccountSigner only signs INVOKE transactions");
  }

  async signDeclareTransaction(_details: DeclareSignerDetails): Promise<Signature> {
    throw new Error("SessionAccountSigner only signs INVOKE transactions");
  }
}
