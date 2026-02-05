import {
  Call,
  DeclareSignerDetails,
  DeployAccountSignerDetails,
  InvocationsSignerDetails,
  num,
  Signer,
  SignerInterface,
  Signature,
  TypedData,
} from "starknet";

export class SessionKeySigner extends SignerInterface {
  private inner: Signer;
  private sessionPublicKey: string;

  constructor(sessionPrivateKey: string, sessionPublicKey: string) {
    super();
    this.inner = new Signer(sessionPrivateKey);
    this.sessionPublicKey = sessionPublicKey;
  }

  async getPubKey(): Promise<string> {
    return this.sessionPublicKey;
  }

  async signMessage(typedData: TypedData, accountAddress: string): Promise<Signature> {
    return this.inner.signMessage(typedData, accountAddress);
  }

  async signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    const signature = await this.inner.signTransaction(transactions, transactionsDetail);
    const [r, s] = Array.isArray(signature)
      ? signature
      : [signature.r, signature.s];
    return [this.sessionPublicKey, num.toHex(r), num.toHex(s)];
  }

  async signDeployAccountTransaction(
    _transaction: DeployAccountSignerDetails
  ): Promise<Signature> {
    throw new Error("Session key signer cannot sign deploy account transactions");
  }

  async signDeclareTransaction(_transaction: DeclareSignerDetails): Promise<Signature> {
    throw new Error("Session key signer cannot sign declare transactions");
  }
}
