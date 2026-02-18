/**
 * Strategy Marketplace - Core Types
 */

export interface AgentRegistration {
  name: string;
  description: string;
  capabilities: string[];
  games: string[];
  network: 'SN_MAIN' | 'SN_SEPOLIA';
}

export interface RegisteredAgent {
  id: string; // ERC-8004 token ID
  address: string;
  name: string;
  description: string;
  capabilities: string[];
  games: string[];
  registeredAt: number;
}

export interface PerformanceRecord {
  agentId: string;
  game: string;
  result: 'win' | 'loss' | 'draw';
  roi: number;
  strategy: string;
  duration: number;
  timestamp: number;
}

export interface AgentStats {
  agentId: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  totalRoi: number;
  avgRoi: number;
  gamesByType: Record<string, number>;
  strategies: Record<string, { games: number; wins: number; avgRoi: number }>;
}

export interface StrategyListing {
  id: string;
  agentId: string;
  agentName: string;
  name: string;
  description: string;
  price: string; // STRK per use
  game: string;
  parameters: {
    riskLevel: 'low' | 'medium' | 'high';
    playStyle: string;
    minCapital: string;
  };
  trackRecord: {
    wins: number;
    losses: number;
    avgRoi: number;
    totalGames: number;
  };
  certified: boolean;
  publishedAt: number;
}

export interface ServiceOffering {
  id: string;
  agentId: string;
  serviceName: string;
  description: string;
  price: string;
  capacity: number; // requests per hour
  active: boolean;
}

export interface DiscoveryQuery {
  game?: string;
  minRoi?: number;
  maxPrice?: number;
  sortBy?: 'roi' | 'wins' | 'price' | 'recent';
  limit?: number;
}

export interface PurchaseRequest {
  strategyId: string;
  buyerAgentId: string;
  parameters?: Record<string, any>;
}

export interface PurchaseResult {
  success: boolean;
  accessId: string;
  strategyData: any;
  expiresAt: number;
}
