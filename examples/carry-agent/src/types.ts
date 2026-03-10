export type ExtendedTradingConfig = {
  minOrderSize: number;
  minOrderSizeChange: number;
  minPriceChange: number;
  maxNumOrders?: number;
  limitPriceCap?: number;
  limitPriceFloor?: number;
  maxMarketOrderValue?: number;
  maxLimitOrderValue?: number;
  maxPositionValue?: number;
  maxLeverage?: number;
};

export type ExtendedMarketSnapshot = {
  market: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingRateTimestampMs?: number;
  openInterestUsd?: number;
  dailyVolumeUsd?: number;
  tradingConfig: ExtendedTradingConfig;
};

export type ExtendedFundingPoint = {
  timestamp: number;
  fundingRate: number;
};

export type ExtendedUserFees = {
  market: string;
  makerFeeRate: number;
  takerFeeRate: number;
  builderFeeRate?: number;
};

export type CarryCostInput = {
  notionalUsd: number;
  holdHours: number;
  expectedFundingRateHourly: number;
  spotEntryFeeRate: number;
  spotExitFeeRate: number;
  perpEntryFeeRate: number;
  perpExitFeeRate: number;
  expectedSlippageBps: number;
  driftReserveBps: number;
  gasCostUsdTotal: number;
};

export type CarryCostEstimate = {
  expectedFundingIncomeUsd: number;
  feeCostUsd: number;
  slippageCostUsd: number;
  driftReserveUsd: number;
  gasCostUsd: number;
  totalCostUsd: number;
  netEdgeUsd: number;
  netEdgeBps: number;
};

export type CarryDecisionAction = "ENTER" | "HOLD" | "EXIT" | "PAUSE";

export type CarryDecision = {
  action: CarryDecisionAction;
  reasonCode: string;
  reason: string;
  regime: {
    averageFundingRateHourly: number;
    positiveShare: number;
    isStrong: boolean;
  };
  edge: CarryCostEstimate;
};

export type CarryRunMode = "dry-run" | "execute";

export type ExecutionIncidentType =
  | "legging_timeout"
  | "second_leg_failed"
  | "unhedged_exceeds_cap";

export type ExecutionIncident = {
  type: ExecutionIncidentType;
  message: string;
};

export type ExecutionStatus = "executed" | "neutralized" | "blocked";

export type ExecutionOrderResult = {
  orderId: string;
  filledNotionalUsd: number;
  txHash?: string;
};

export type ExecutionOutcome = {
  status: ExecutionStatus;
  reasonCode: string;
  message: string;
  incidents: ExecutionIncident[];
  deadmanArmed: boolean;
  spotOrder?: ExecutionOrderResult;
  perpOrder?: ExecutionOrderResult;
  neutralizationOrder?: ExecutionOrderResult;
};
