export type FundingProviderSelection = "auto" | "mock" | "skipped" | "starkgate-l1";
export type FundingProviderName = "mock" | "skipped" | "starkgate-l1";
export type FundingStatus = "mock" | "skipped" | "confirmed";

export interface FundingConfig {
  minDeployerBalanceWei: bigint;
  l1RpcUrl?: string;
  l1PrivateKey?: string;
  starkgateEthBridgeAddress?: string;
  fundingTimeoutMs?: number;
  fundingPollIntervalMs?: number;
  l1GasBufferWei?: bigint;
}

export interface FundParams {
  targetAddress: string;
  amountWei: bigint;
  token: "ETH";
  network: string;
  requiredBalanceWei: bigint;
  readTargetBalanceWei: () => Promise<bigint>;
}

export interface FundResult {
  provider: FundingProviderName;
  status: FundingStatus;
  source_chain: string;
  source_tx_hash?: string;
  confirmed_at?: string;
  skipped_reason?: "already_funded";
  amount_wei?: string;
  token?: "ETH";
}

export interface FundingProvider {
  name: FundingProviderName;
  preflight(config: FundingConfig): Promise<void>;
  fund(params: FundParams): Promise<FundResult>;
}
