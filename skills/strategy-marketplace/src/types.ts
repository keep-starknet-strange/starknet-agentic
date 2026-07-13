/**
 * Strategy Marketplace - Core Types
 * Defines all TypeScript interfaces for the strategy marketplace skill.
 * @module strategy-marketplace/types
 */

/**
 * Configuration for registering a new agent in the marketplace.
 * Used when calling registerAgent() to create an ERC-8004 identity.
 */
export interface AgentRegistration {
  /** Unique name for the agent (lowercase letters, numbers, hyphens) */
  name: string;
  /** Human-readable description of the agent's capabilities */
  description: string;
  /** List of capability tags (e.g., ['gaming', 'trading', 'analysis']) */
  capabilities: string[];
  /** List of games this agent can play */
  games: string[];
  /** Target Starknet network for deployment */
  network: 'SN_MAIN' | 'SN_SEPOLIA';
}

/**
 * A registered agent with ERC-8004 on-chain identity.
 * Returned after successful registration in the marketplace.
 */
export interface RegisteredAgent {
  /** Unique ERC-8004 token ID for this agent */
  id: string;
  /** Starknet address of the agent's identity contract */
  address: string;
  /** Network where the agent is registered */
  network: 'SN_MAIN' | 'SN_SEPOLIA';
  /** Agent's display name */
  name: string;
  /** Agent's description */
  description: string;
  /** Agent's declared capabilities */
  capabilities: string[];
  /** Games this agent can play */
  games: string[];
  /** Unix timestamp when agent was registered */
  registeredAt: number;
}

/**
 * A single performance record for tracking agent game results.
 * Used to build track records and compute statistics.
 */
export interface PerformanceRecord {
  /** ID of the agent who played */
  agentId: string;
  /** Name of the game played */
  game: string;
  /** Result of the game */
  result: 'win' | 'loss' | 'draw';
  /** Return on investment multiplier (e.g., 2.5 = 2.5x returns) */
  roi: number;
  /** Name of the strategy used */
  strategy: string;
  /** Duration of the game in seconds */
  duration: number;
  /** Unix timestamp when the game ended */
  timestamp: number;
}

/**
 * Aggregated statistics for an agent's performance.
 * Computed from all performance records.
 */
export interface AgentStats {
  /** Agent ID these stats belong to */
  agentId: string;
  /** Total number of games played */
  totalGames: number;
  /** Number of games won */
  wins: number;
  /** Number of games lost */
  losses: number;
  /** Number of games drawn */
  draws: number;
  /** Total ROI across all games */
  totalRoi: number;
  /** Average ROI per game */
  avgRoi: number;
  /** Game counts by game type */
  gamesByType: Record<string, number>;
  /** Performance stats by strategy name */
  strategies: Record<string, { games: number; wins: number; avgRoi: number }>;
}

/**
 * A strategy listing in the marketplace.
 * Contains all information needed for discovery and purchase.
 */
export interface StrategyListing {
  /** Unique listing ID */
  id: string;
  /** ID of the agent who published this strategy */
  agentId: string;
  /** Display name of the publishing agent */
  agentName: string;
  /** Strategy display name */
  name: string;
  /** Detailed strategy description */
  description: string;
  /** Price in STRK per use */
  price: number;
  /** Target game for this strategy */
  game: string;
  /** Strategy parameters and configuration */
  parameters: {
    /** Risk level classification */
    riskLevel: 'low' | 'medium' | 'high';
    /** Play style description */
    playStyle: string;
    /** Minimum capital required */
    minCapital: string;
  };
  /** Performance track record */
  trackRecord: {
    /** Number of wins */
    wins: number;
    /** Number of losses */
    losses: number;
    /** Average ROI */
    avgRoi: number;
    /** Total games played */
    totalGames: number;
  };
  /** Whether strategy meets certification criteria */
  certified: boolean;
  /** Unix timestamp when published */
  publishedAt: number;
}

/**
 * A service offering where an agent provides capabilities.
 * Agents can offer their services for a fee.
 */
export interface ServiceOffering {
  /** Unique offering ID */
  id: string;
  /** ID of the agent offering this service */
  agentId: string;
  /** Name of the service */
  serviceName: string;
  /** Detailed service description */
  description: string;
  /** Price per request in STRK */
  price: number;
  /** Maximum requests per hour */
  capacity: number;
  /** Whether the service is currently accepting requests */
  active: boolean;
}

/**
 * Query parameters for discovering strategies.
 * All fields are optional for flexible filtering.
 */
export interface DiscoveryQuery {
  /** Filter by target game */
  game?: string;
  /** Minimum average ROI */
  minRoi?: number;
  /** Maximum price in STRK */
  maxPrice?: number;
  /** Sort results by this field */
  sortBy?: 'roi' | 'wins' | 'price' | 'recent';
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Request to purchase a strategy.
 * Includes strategy ID and buyer information.
 */
export interface PurchaseRequest<P = unknown> {
  /** ID of the strategy to purchase */
  strategyId: string;
  /** ID of the agent making the purchase */
  buyerAgentId: string;
  /** Optional custom parameters for the strategy */
  parameters?: P;
}

/**
 * Result of a successful strategy purchase.
 * Contains access token and strategy data.
 */
export interface PurchaseResult<R = unknown> {
  /** Whether the purchase was successful */
  success: boolean;
  /** Unique access ID for this purchase */
  accessId: string;
  /** The purchased strategy data */
  strategyData: R;
  /** Unix timestamp when access expires */
  expiresAt: number;
}
