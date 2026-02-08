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
    const state = await getMarketState(i, address.toString());
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
    questionHash: info[0].toString(),
    resolutionTime: Number(info[1]),
    oracle: info[2].toString(),
    collateralToken: info[3].toString(),
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
    const agent = (await tracker.get_market_predictor(marketId, i)).toString();
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
  return [
    {
      id: 0,
      address: "0xdemo1",
      questionHash: "0x1",
      resolutionTime: now + 86400 * 30,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 45000n * 10n ** 18n,
      yesPool: 28000n * 10n ** 18n,
      noPool: 17000n * 10n ** 18n,
      impliedProbYes: 0.622,
      impliedProbNo: 0.378,
    },
    {
      id: 1,
      address: "0xdemo2",
      questionHash: "0x2",
      resolutionTime: now + 86400 * 90,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 12000n * 10n ** 18n,
      yesPool: 4080n * 10n ** 18n,
      noPool: 7920n * 10n ** 18n,
      impliedProbYes: 0.34,
      impliedProbNo: 0.66,
    },
    {
      id: 2,
      address: "0xdemo3",
      questionHash: "0x3",
      resolutionTime: now + 86400 * 7,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 100,
      status: 0,
      totalPool: 8500n * 10n ** 18n,
      yesPool: 7225n * 10n ** 18n,
      noPool: 1275n * 10n ** 18n,
      impliedProbYes: 0.85,
      impliedProbNo: 0.15,
    },
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
    0: [0.71, 0.65, 0.58, 0.73],
    1: [0.28, 0.35, 0.42, 0.31],
    2: [0.89, 0.82, 0.91, 0.78],
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
export const DEMO_QUESTIONS: Record<number, string> = {
  0: "Will ETH surpass $5,000 by March 2026?",
  1: "Will STRK be above $2 by Q3 2026?",
  2: "Will Starknet reach 100 TPS daily average this month?",
};
