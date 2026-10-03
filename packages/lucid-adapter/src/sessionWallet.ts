export interface SessionKeyParams {
  owner: string;
  sessionSalt: string;
  validUntil: number;
}

export class SessionOperationalWallet {
  public readonly owner: string;
  public readonly sessionKey: string;
  public readonly validUntil: number;

  constructor(params: SessionKeyParams) {
    this.owner = params.owner;
    this.sessionSalt = params.sessionSalt;
    this.validUntil = params.validUntil;
    this.sessionKey = this.deriveSessionKey();
  }

  private sessionSalt: string;

  private deriveSessionKey(): string {
    // SNIP-12 path placeholder - real implementation uses starknet-crypto pedersen
    return `0xsession_${this.owner.slice(2,10)}_${this.sessionSalt}`;
  }

  isValid(): boolean {
    return Date.now() < this.validUntil;
  }

  sign(payload: string): string {
    if (!this.isValid()) throw new Error('Session expired');
    return `sig_${this.sessionKey}_${payload}`;
  }
}
