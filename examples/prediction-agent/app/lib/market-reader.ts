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
    {
      id: 3,
      address: "0xdemo4",
      questionHash: "0x4",
      resolutionTime: now + 86400 * 21,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 62000n * 10n ** 18n,
      yesPool: 44640n * 10n ** 18n,
      noPool: 17360n * 10n ** 18n,
      impliedProbYes: 0.72,
      impliedProbNo: 0.28,
    },
    {
      id: 4,
      address: "0xdemo5",
      questionHash: "0x5",
      resolutionTime: now + 86400 * 30,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 18000n * 10n ** 18n,
      yesPool: 9900n * 10n ** 18n,
      noPool: 8100n * 10n ** 18n,
      impliedProbYes: 0.55,
      impliedProbNo: 0.45,
    },
    {
      id: 5,
      address: "0xdemo6",
      questionHash: "0x6",
      resolutionTime: now + 86400 * 14,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 150,
      status: 0,
      totalPool: 95000n * 10n ** 18n,
      yesPool: 17100n * 10n ** 18n,
      noPool: 77900n * 10n ** 18n,
      impliedProbYes: 0.18,
      impliedProbNo: 0.82,
    },
    {
      id: 6,
      address: "0xdemo7",
      questionHash: "0x7",
      resolutionTime: now + 86400 * 300,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 22000n * 10n ** 18n,
      yesPool: 7700n * 10n ** 18n,
      noPool: 14300n * 10n ** 18n,
      impliedProbYes: 0.35,
      impliedProbNo: 0.65,
    },
    {
      id: 7,
      address: "0xdemo8",
      questionHash: "0x8",
      resolutionTime: now + 86400 * 180,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 15000n * 10n ** 18n,
      yesPool: 2250n * 10n ** 18n,
      noPool: 12750n * 10n ** 18n,
      impliedProbYes: 0.15,
      impliedProbNo: 0.85,
    },
    {
      id: 8,
      address: "0xdemo9",
      questionHash: "0x9",
      resolutionTime: now + 86400 * 150,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 32000n * 10n ** 18n,
      yesPool: 14400n * 10n ** 18n,
      noPool: 17600n * 10n ** 18n,
      impliedProbYes: 0.45,
      impliedProbNo: 0.55,
    },
    {
      id: 9,
      address: "0xdemo10",
      questionHash: "0xa",
      resolutionTime: now + 86400 * 300,
      oracle: "0xoracle",
      collateralToken: "0xstrk",
      feeBps: 200,
      status: 0,
      totalPool: 8000n * 10n ** 18n,
      yesPool: 1600n * 10n ** 18n,
      noPool: 6400n * 10n ** 18n,
      impliedProbYes: 0.2,
      impliedProbNo: 0.8,
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
    3: [0.75, 0.70, 0.68, 0.74],
    4: [0.52, 0.58, 0.48, 0.55],
    5: [0.15, 0.20, 0.22, 0.17],
    6: [0.30, 0.38, 0.35, 0.32],
    7: [0.12, 0.18, 0.14, 0.16],
    8: [0.42, 0.48, 0.40, 0.46],
    9: [0.18, 0.22, 0.15, 0.20],
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
  3: "Will Bitcoin hold above $90,000 through February 2026?",
  4: "Will the next US spending bill pass by March 2026?",
  5: "Will Kansas City win Super Bowl LXI?",
  6: "Will Apple announce a foldable device in 2026?",
  7: "Will the next Marvel movie gross $1B opening weekend?",
  8: "Will total DeFi TVL exceed $250B by mid-2026?",
  9: "Will any G7 country launch a retail CBDC in 2026?",
};
