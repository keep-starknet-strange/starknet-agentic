import { RpcProvider, Contract } from "starknet";
import { config } from "./config";
import { fromScaled, averageBrier } from "./accuracy";

const provider = new RpcProvider({ nodeUrl: config.STARKNET_RPC_URL });

// Simplified ABIs for read-only calls
const MARKET_ABI = [
  {
    name: "get_status",
    type: "function",
    inputs: [],
    outputs: [{ type: "core::integer::u8" }],
    state_mutability: "view",
  },
  {
    name: "get_total_pool",
    type: "function",
    inputs: [],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    name: "get_implied_probs",
    type: "function",
    inputs: [],
    outputs: [{ type: "core::array::Array::<(core::integer::u8, core::integer::u256)>" }],
    state_mutability: "view",
  },
  {
    name: "get_market_info",
    type: "function",
    inputs: [],
    outputs: [
      { type: "core::felt252" },
      { type: "core::integer::u64" },
      { type: "core::starknet::contract_address::ContractAddress" },
      { type: "core::starknet::contract_address::ContractAddress" },
      { type: "core::integer::u16" },
    ],
    state_mutability: "view",
  },
  {
    name: "get_bet",
    type: "function",
    inputs: [
      { name: "user", type: "core::starknet::contract_address::ContractAddress" },
      { name: "outcome", type: "core::integer::u8" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    name: "get_winning_outcome",
    type: "function",
    inputs: [],
    outputs: [{ type: "core::integer::u8" }],
    state_mutability: "view",
  },
] as const;

const FACTORY_ABI = [
  {
    name: "get_market_count",
    type: "function",
    inputs: [],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    name: "get_market",
    type: "function",
    inputs: [{ name: "id", type: "core::integer::u256" }],
    outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
    state_mutability: "view",
  },
] as const;

const ACCURACY_ABI = [
  {
    name: "get_brier_score",
    type: "function",
    inputs: [{ name: "agent", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u256" }, { type: "core::integer::u64" }],
    state_mutability: "view",
  },
  {
    name: "get_prediction",
    type: "function",
    inputs: [
      { name: "agent", type: "core::starknet::contract_address::ContractAddress" },
      { name: "market_id", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    name: "get_market_predictor_count",
    type: "function",
    inputs: [{ name: "market_id", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u64" }],
    state_mutability: "view",
  },
  {
    name: "get_market_predictor",
    type: "function",
    inputs: [
      { name: "market_id", type: "core::integer::u256" },
      { name: "index", type: "core::integer::u64" },
    ],
    outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
    state_mutability: "view",
  },
  {
    name: "get_weighted_probability",
    type: "function",
    inputs: [{ name: "market_id", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    name: "is_finalized",
    type: "function",
    inputs: [{ name: "market_id", type: "core::integer::u256" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
] as const;

export interface MarketState {
  id: number;
  address: string;
  questionHash: string;
  resolutionTime: number;
  oracle: string;
  collateralToken: string;
  feeBps: number;
  status: number; // 0=OPEN, 1=CLOSED, 2=RESOLVED
  totalPool: bigint;
  yesPool: bigint;
  noPool: bigint;
  impliedProbYes: number;
  impliedProbNo: number;
  winningOutcome?: number;
}

export interface AgentPrediction {
  agent: string;
  marketId: number;
  predictedProb: number;
  brierScore: number;
  predictionCount: number;
}

export interface LeaderboardEntry {
  agent: string;
  avgBrier: number;
  predictionCount: number;
  rank: number;
}

/** Get all markets from the factory. */
export async function getMarkets(): Promise<MarketState[]> {
  if (config.MARKET_FACTORY_ADDRESS === "0x0") return getDemoMarkets();

  const factory = new Contract(FACTORY_ABI as any, config.MARKET_FACTORY_ADDRESS, provider);
  const countResult = await factory.get_market_count();
  const count = Number(countResult);

  const markets: MarketState[] = [];
  for (let i = 0; i < count; i++) {
    const address = await factory.get_market(i);
    const addrHex = "0x" + BigInt(address.toString()).toString(16);
    const state = await getMarketState(i, addrHex);
    markets.push(state);
  }
  return markets;
}

/** Get a single market's state. */
export async function getMarketState(id: number, address: string): Promise<MarketState> {
  const market = new Contract(MARKET_ABI as any, address, provider);

  const [status, totalPool, probs, info] = await Promise.all([
    market.get_status(),
    market.get_total_pool(),
    market.get_implied_probs(),
    market.get_market_info(),
  ]);

  return {
    id,
    address,
    questionHash: "0x" + BigInt(info[0].toString()).toString(16),
    resolutionTime: Number(info[1]),
    oracle: "0x" + BigInt(info[2].toString()).toString(16),
    collateralToken: "0x" + BigInt(info[3].toString()).toString(16),
    feeBps: Number(info[4]),
    status: Number(status),
    totalPool: BigInt(totalPool.toString()),
    yesPool: BigInt(probs[1]?.[1]?.toString() ?? "0"),
    noPool: BigInt(probs[0]?.[1]?.toString() ?? "0"),
    impliedProbYes: fromScaled(BigInt(probs[1]?.[1]?.toString() ?? "500000000000000000")),
    impliedProbNo: fromScaled(BigInt(probs[0]?.[1]?.toString() ?? "500000000000000000")),
  };
}

/** Get agent predictions for a market. */
export async function getAgentPredictions(marketId: number): Promise<AgentPrediction[]> {
  if (config.ACCURACY_TRACKER_ADDRESS === "0x0") return getDemoPredictions(marketId);

  const tracker = new Contract(ACCURACY_ABI as any, config.ACCURACY_TRACKER_ADDRESS, provider);
  const count = Number(await tracker.get_market_predictor_count(marketId));

  const predictions: AgentPrediction[] = [];
  for (let i = 0; i < count; i++) {
    const agentRaw = await tracker.get_market_predictor(marketId, i);
    const agent = "0x" + BigInt(agentRaw.toString()).toString(16);
    const prediction = await tracker.get_prediction(agent, marketId);
    const [cumulative, predCount] = await tracker.get_brier_score(agent);

    predictions.push({
      agent,
      marketId,
      predictedProb: fromScaled(BigInt(prediction.toString())),
      brierScore: averageBrier(BigInt(cumulative.toString()), BigInt(predCount.toString())),
      predictionCount: Number(predCount),
    });
  }
  return predictions;
}

/** Get reputation-weighted probability. */
export async function getWeightedProbability(marketId: number): Promise<number> {
  if (config.ACCURACY_TRACKER_ADDRESS === "0x0") return 0.5;

  const tracker = new Contract(ACCURACY_ABI as any, config.ACCURACY_TRACKER_ADDRESS, provider);
  const result = await tracker.get_weighted_probability(marketId);
  return fromScaled(BigInt(result.toString()));
}

// ============ Demo Data (when contracts not deployed) ============

function getDemoMarkets(): MarketState[] {
  const now = Math.floor(Date.now() / 1000);
  // Super Bowl LX game end ~midnight UTC Feb 9, 2026
  const sbEnd = Math.floor(new Date("2026-02-09T05:00:00Z").getTime() / 1000);
  return [
    // Super Bowl LX markets (IDs 0-9)
    { id: 0, address: "0xpending0", questionHash: "0x1", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 45000n * 10n ** 18n, yesPool: 28000n * 10n ** 18n, noPool: 17000n * 10n ** 18n, impliedProbYes: 0.622, impliedProbNo: 0.378 },
    { id: 1, address: "0xpending1", questionHash: "0x2", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 18000n * 10n ** 18n, yesPool: 9360n * 10n ** 18n, noPool: 8640n * 10n ** 18n, impliedProbYes: 0.52, impliedProbNo: 0.48 },
    { id: 2, address: "0xpending2", questionHash: "0x3", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 8500n * 10n ** 18n, yesPool: 2975n * 10n ** 18n, noPool: 5525n * 10n ** 18n, impliedProbYes: 0.35, impliedProbNo: 0.65 },
    { id: 3, address: "0xpending3", questionHash: "0x4", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 150, status: 0, totalPool: 5000n * 10n ** 18n, yesPool: 3500n * 10n ** 18n, noPool: 1500n * 10n ** 18n, impliedProbYes: 0.70, impliedProbNo: 0.30 },
    { id: 4, address: "0xpending4", questionHash: "0x5", resolutionTime: sbEnd + 7200, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 12000n * 10n ** 18n, yesPool: 6600n * 10n ** 18n, noPool: 5400n * 10n ** 18n, impliedProbYes: 0.55, impliedProbNo: 0.45 },
    { id: 5, address: "0xpending5", questionHash: "0x6", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 7000n * 10n ** 18n, yesPool: 2100n * 10n ** 18n, noPool: 4900n * 10n ** 18n, impliedProbYes: 0.30, impliedProbNo: 0.70 },
    { id: 6, address: "0xpending6", questionHash: "0x7", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 22000n * 10n ** 18n, yesPool: 10560n * 10n ** 18n, noPool: 11440n * 10n ** 18n, impliedProbYes: 0.48, impliedProbNo: 0.52 },
    { id: 7, address: "0xpending7", questionHash: "0x8", resolutionTime: sbEnd - 7200, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 6000n * 10n ** 18n, yesPool: 2700n * 10n ** 18n, noPool: 3300n * 10n ** 18n, impliedProbYes: 0.45, impliedProbNo: 0.55 },
    { id: 8, address: "0xpending8", questionHash: "0x9", resolutionTime: sbEnd - 3600, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 9000n * 10n ** 18n, yesPool: 5850n * 10n ** 18n, noPool: 3150n * 10n ** 18n, impliedProbYes: 0.65, impliedProbNo: 0.35 },
    { id: 9, address: "0xpending9", questionHash: "0xa", resolutionTime: sbEnd, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 4000n * 10n ** 18n, yesPool: 280n * 10n ** 18n, noPool: 3720n * 10n ** 18n, impliedProbYes: 0.07, impliedProbNo: 0.93 },
    // Crypto markets (IDs 10-13)
    { id: 10, address: "0xpending10", questionHash: "0xb", resolutionTime: now + 86400 * 30, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 32000n * 10n ** 18n, yesPool: 14400n * 10n ** 18n, noPool: 17600n * 10n ** 18n, impliedProbYes: 0.45, impliedProbNo: 0.55 },
    { id: 11, address: "0xpending11", questionHash: "0xc", resolutionTime: now + 86400 * 150, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 12000n * 10n ** 18n, yesPool: 4080n * 10n ** 18n, noPool: 7920n * 10n ** 18n, impliedProbYes: 0.34, impliedProbNo: 0.66 },
    { id: 12, address: "0xpending12", questionHash: "0xd", resolutionTime: now + 86400 * 21, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 8500n * 10n ** 18n, yesPool: 2550n * 10n ** 18n, noPool: 5950n * 10n ** 18n, impliedProbYes: 0.30, impliedProbNo: 0.70 },
    { id: 13, address: "0xpending13", questionHash: "0xe", resolutionTime: now + 86400 * 21, oracle: "0xoracle", collateralToken: "0xstrk", feeBps: 200, status: 0, totalPool: 62000n * 10n ** 18n, yesPool: 44640n * 10n ** 18n, noPool: 17360n * 10n ** 18n, impliedProbYes: 0.72, impliedProbNo: 0.28 },
  ];
}

function getDemoPredictions(marketId: number): AgentPrediction[] {
  const agents = [
    { agent: "0xAlpha", brierScore: 0.12, predictionCount: 47 },
    { agent: "0xBeta", brierScore: 0.15, predictionCount: 34 },
    { agent: "0xGamma", brierScore: 0.19, predictionCount: 28 },
    { agent: "0xDelta", brierScore: 0.24, predictionCount: 12 },
  ];

  const probsByMarket: Record<number, number[]> = {
    0: [0.62, 0.58, 0.65, 0.60],   // Seahawks win
    1: [0.52, 0.48, 0.55, 0.50],   // Over 45.5
    2: [0.35, 0.30, 0.38, 0.33],   // 100+ rush yards
    3: [0.70, 0.65, 0.72, 0.68],   // Halftime 15min
    4: [0.55, 0.52, 0.58, 0.54],   // QB MVP
    5: [0.30, 0.28, 0.35, 0.32],   // Defensive/ST TD
    6: [0.48, 0.45, 0.52, 0.47],   // Cover -4.5
    7: [0.45, 0.42, 0.48, 0.44],   // First score TD
    8: [0.65, 0.60, 0.68, 0.63],   // Score last 2min 1H
    9: [0.07, 0.05, 0.09, 0.06],   // Overtime
    10: [0.45, 0.40, 0.48, 0.43],  // ETH 5k
    11: [0.34, 0.30, 0.38, 0.32],  // STRK $2
    12: [0.30, 0.25, 0.35, 0.28],  // Starknet 100 TPS
    13: [0.72, 0.68, 0.75, 0.70],  // BTC 90k
  };

  const probs = probsByMarket[marketId] ?? [0.5, 0.5, 0.5, 0.5];
  return agents.map((a, i) => ({
    ...a,
    marketId,
    predictedProb: probs[i],
  }));
}

/** Demo leaderboard data. */
export function getDemoLeaderboard(): LeaderboardEntry[] {
  return [
    { agent: "0xAlpha", avgBrier: 0.12, predictionCount: 47, rank: 1 },
    { agent: "0xBeta", avgBrier: 0.15, predictionCount: 34, rank: 2 },
    { agent: "0xGamma", avgBrier: 0.19, predictionCount: 28, rank: 3 },
    { agent: "0xDelta", avgBrier: 0.24, predictionCount: 12, rank: 4 },
    { agent: "0xEpsilon", avgBrier: 0.31, predictionCount: 8, rank: 5 },
  ];
}

// Question text mapping (off-chain metadata)
// Super Bowl LX markets (IDs 0-9), crypto markets (IDs 10-13)
export const DEMO_QUESTIONS: Record<number, string> = {
  0: "Will the Seattle Seahawks win Super Bowl LX?",
  1: "Will the total score exceed 45.5 points?",
  2: "Will any player rush for 100+ yards?",
  3: "Will Bad Bunny's halftime show exceed 15 minutes?",
  4: "Will the Super Bowl LX MVP be a quarterback?",
  5: "Will there be a defensive or special teams touchdown?",
  6: "Will the Seahawks cover the -4.5 spread?",
  7: "Will the first score be a touchdown?",
  8: "Will either team score in the final 2 minutes of the 1st half?",
  9: "Will Super Bowl LX go to overtime?",
  10: "Will ETH surpass $5,000 by March 2026?",
  11: "Will STRK be above $2 by Q3 2026?",
  12: "Will Starknet reach 100 TPS daily average this month?",
  13: "Will Bitcoin hold above $90,000 through February 2026?",
};

/** Check if a market question is Super Bowl related. */
export function isSuperBowlMarket(marketId: number): boolean {
  return marketId >= 0 && marketId <= 9;
}

/** Regex to detect Super Bowl related questions. */
export const SUPER_BOWL_REGEX =
  /super bowl|nfl|seahawks|patriots|touchdown|quarterback|mvp|halftime|spread|overtime|rushing|first score|defensive/i;
