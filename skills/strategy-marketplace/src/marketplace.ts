/**
 * Strategy Marketplace
 * Publish, discover, and purchase strategies
 */

import { randomUUID } from 'node:crypto';
import type { 
  StrategyListing, 
  ServiceOffering, 
  DiscoveryQuery,
  PurchaseRequest,
  PurchaseResult
} from './types';
import { getAgent } from './registry';

type MarketplaceState = {
  listings: StrategyListing[];
  offerings: ServiceOffering[];
};

function getMarketplaceState(): MarketplaceState {
  const globalState = globalThis as typeof globalThis & {
    __strategyMarketplaceState?: MarketplaceState;
  };
  if (!globalState.__strategyMarketplaceState) {
    globalState.__strategyMarketplaceState = {
      listings: [],
      offerings: []
    };
  }
  return globalState.__strategyMarketplaceState;
}

/**
 * Publish a strategy to the marketplace
 */
export async function publishStrategy(config: {
  agentId: string;
  name: string;
  description: string;
  price: string | number;
  game: string;
  parameters: StrategyListing['parameters'];
  trackRecord: StrategyListing['trackRecord'];
}): Promise<StrategyListing> {
  const validatedConfig = validatePublishStrategyInput(config);

  const agent = await getAgent(validatedConfig.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${validatedConfig.agentId}`);
  }

  const validatedPrice = parseNonNegativePrice(validatedConfig.price, 'strategy price');
  
  // Check certification requirements
  const certified = await checkCertification(validatedConfig.trackRecord);
  
  const listing: StrategyListing = {
    id: generateListingId(),
    agentId: validatedConfig.agentId,
    agentName: agent.name,
    name: validatedConfig.name,
    description: validatedConfig.description,
    price: validatedPrice,
    game: validatedConfig.game,
    parameters: validatedConfig.parameters,
    trackRecord: validatedConfig.trackRecord,
    certified,
    publishedAt: Date.now()
  };
  
  await storeListing(listing);
  
  console.log(`[Marketplace] Published: ${listing.name} by ${agent.name} (${listing.price} STRK)`);
  
  return listing;
}

/**
 * Discover strategies matching criteria
 */
export async function discoverStrategies(query: DiscoveryQuery): Promise<StrategyListing[]> {
  const normalizedQuery = validateDiscoveryQuery(query);
  let listings = await getAllListings();
  const { game, minRoi, maxPrice } = normalizedQuery;
  
  // Apply filters
  if (game !== undefined) {
    listings = listings.filter(l => l.game === game);
  }
  if (minRoi !== undefined) {
    listings = listings.filter(l => l.trackRecord.avgRoi >= minRoi);
  }
  if (maxPrice !== undefined) {
    listings = listings.filter(l => l.price <= maxPrice);
  }
  
  // Sort
  switch (normalizedQuery.sortBy) {
    case 'roi':
      listings.sort((a, b) => b.trackRecord.avgRoi - a.trackRecord.avgRoi);
      break;
    case 'wins':
      listings.sort((a, b) => b.trackRecord.wins - a.trackRecord.wins);
      break;
    case 'price':
      listings.sort((a, b) => a.price - b.price);
      break;
    case 'recent':
    default:
      listings.sort((a, b) => b.publishedAt - a.publishedAt);
  }
  
  return listings.slice(0, normalizedQuery.limit || 20);
}

/**
 * Get strategy details
 */
export async function getStrategy(strategyId: string): Promise<StrategyListing | null> {
  const normalizedStrategyId = requireNonEmptyString(strategyId, 'strategyId');
  const listings = await getAllListings();
  return listings.find(l => l.id === normalizedStrategyId) || null;
}

/**
 * Purchase/rent a strategy
 */
export async function purchaseStrategy(request: PurchaseRequest): Promise<PurchaseResult> {
  const strategyId = requireNonEmptyString(request.strategyId, 'strategyId');
  const buyerAgentId = requireNonEmptyString(request.buyerAgentId, 'buyerAgentId');
  const strategy = await getStrategy(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  const buyer = await getAgent(buyerAgentId);
  if (!buyer) {
    throw new Error(`Buyer agent not found: ${buyerAgentId}`);
  }
  
  const paymentVerified = await verifyPaymentStub(buyerAgentId, strategy.id, strategy.price);
  if (!paymentVerified) {
    throw new Error('Strategy purchase failed: payment verification unsuccessful');
  }
  
  const access: PurchaseResult = {
    success: true,
    accessId: generateAccessId(),
    strategyData: {
      name: strategy.name,
      parameters: strategy.parameters,
      trackRecord: strategy.trackRecord
    },
    expiresAt: Date.now() + 3600000 // 1 hour
  };
  
  console.log(`[Marketplace] Purchased: ${strategy.name} by ${buyer.id}`);
  
  return access;
}

/**
 * Offer agent as a service
 */
export async function offerService(config: {
  agentId: string;
  serviceName: string;
  description: string;
  price: string | number;
  capacity: number;
}): Promise<ServiceOffering> {
  const validatedConfig = validateServiceInput(config);
  const agent = await getAgent(validatedConfig.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${validatedConfig.agentId}`);
  }

  const validatedPrice = parseNonNegativePrice(validatedConfig.price, 'service price');
  
  const offering: ServiceOffering = {
    id: generateOfferingId(),
    agentId: validatedConfig.agentId,
    serviceName: validatedConfig.serviceName,
    description: validatedConfig.description,
    price: validatedPrice,
    capacity: validatedConfig.capacity,
    active: true
  };
  
  await storeOffering(offering);
  
  return offering;
}

/**
 * Get services for an agent
 */
export async function getAgentServices(agentId: string): Promise<ServiceOffering[]> {
  const normalizedAgentId = requireNonEmptyString(agentId, 'agentId');
  const offerings = await getAllOfferings();
  return offerings.filter(o => o.agentId === normalizedAgentId);
}

// Helper functions

async function checkCertification(trackRecord: StrategyListing['trackRecord']): Promise<boolean> {
  // Certification criteria:
  // - Minimum 10 games played
  // - Positive average ROI
  // - Win rate > 50%
  if (trackRecord.totalGames < 10) return false;
  if (trackRecord.avgRoi <= 0) return false;
  const winRate = trackRecord.wins / trackRecord.totalGames;
  return winRate > 0.5;
}

function generateListingId(): string {
  return `strat_${randomUUID().replace(/-/g, '')}`;
}

function generateOfferingId(): string {
  return `svc_${randomUUID().replace(/-/g, '')}`;
}

function generateAccessId(): string {
  return `acc_${randomUUID().replace(/-/g, '')}`;
}

function parseNonNegativePrice(value: string | number, label: string): number {
  const price = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid ${label}: expected a non-negative number`);
  }
  return price;
}

async function storeListing(listing: StrategyListing): Promise<void> {
  const listings = getMarketplaceState().listings;
  const idx = listings.findIndex(item => item.id === listing.id);
  if (idx >= 0) {
    listings[idx] = listing;
  } else {
    listings.push(listing);
  }
  console.log(`[Marketplace] Stored listing: ${listing.id}`);
}

async function getAllListings(): Promise<StrategyListing[]> {
  return [...getMarketplaceState().listings];
}

async function storeOffering(offering: ServiceOffering): Promise<void> {
  const offerings = getMarketplaceState().offerings;
  const idx = offerings.findIndex(item => item.id === offering.id);
  if (idx >= 0) {
    offerings[idx] = offering;
  } else {
    offerings.push(offering);
  }
  console.log(`[Marketplace] Stored offering: ${offering.id}`);
}

async function getAllOfferings(): Promise<ServiceOffering[]> {
  return [...getMarketplaceState().offerings];
}

export function __resetMarketplaceForTests(): void {
  const state = getMarketplaceState();
  state.listings.length = 0;
  state.offerings.length = 0;
}

function requireNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return normalized;
}

function requireFiniteNumber(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${field}: expected a finite number`);
  }
  return value;
}

function validateTrackRecord(trackRecord: StrategyListing['trackRecord']): StrategyListing['trackRecord'] {
  const wins = Math.trunc(requireFiniteNumber(trackRecord.wins, 'trackRecord.wins'));
  const losses = Math.trunc(requireFiniteNumber(trackRecord.losses, 'trackRecord.losses'));
  const totalGames = Math.trunc(requireFiniteNumber(trackRecord.totalGames, 'trackRecord.totalGames'));
  const avgRoi = requireFiniteNumber(trackRecord.avgRoi, 'trackRecord.avgRoi');

  if (wins < 0 || losses < 0 || totalGames < 0) {
    throw new Error('Invalid trackRecord: wins, losses, and totalGames must be non-negative');
  }
  if (totalGames === 0) {
    throw new Error('Invalid trackRecord: totalGames must be greater than 0');
  }
  if (wins + losses > totalGames) {
    throw new Error('Invalid trackRecord: wins + losses cannot exceed totalGames');
  }

  return { wins, losses, totalGames, avgRoi };
}

function validatePublishStrategyInput(config: {
  agentId: string;
  name: string;
  description: string;
  price: string | number;
  game: string;
  parameters: StrategyListing['parameters'];
  trackRecord: StrategyListing['trackRecord'];
}): {
  agentId: string;
  name: string;
  description: string;
  price: string | number;
  game: string;
  parameters: StrategyListing['parameters'];
  trackRecord: StrategyListing['trackRecord'];
} {
  const agentId = requireNonEmptyString(config.agentId, 'agentId');
  const name = requireNonEmptyString(config.name, 'name');
  const description = requireNonEmptyString(config.description, 'description');
  const game = requireNonEmptyString(config.game, 'game');
  const playStyle = requireNonEmptyString(config.parameters.playStyle, 'parameters.playStyle');
  const minCapital = requireNonEmptyString(config.parameters.minCapital, 'parameters.minCapital');
  const trackRecord = validateTrackRecord(config.trackRecord);
  parseNonNegativePrice(config.price, 'strategy price');

  return {
    ...config,
    agentId,
    name,
    description,
    game,
    parameters: {
      ...config.parameters,
      playStyle,
      minCapital
    },
    trackRecord
  };
}

function validateServiceInput(config: {
  agentId: string;
  serviceName: string;
  description: string;
  price: string | number;
  capacity: number;
}): {
  agentId: string;
  serviceName: string;
  description: string;
  price: string | number;
  capacity: number;
} {
  const capacity = Math.trunc(requireFiniteNumber(config.capacity, 'capacity'));
  if (capacity <= 0) {
    throw new Error('Invalid capacity: expected a positive integer');
  }
  parseNonNegativePrice(config.price, 'service price');

  return {
    ...config,
    agentId: requireNonEmptyString(config.agentId, 'agentId'),
    serviceName: requireNonEmptyString(config.serviceName, 'serviceName'),
    description: requireNonEmptyString(config.description, 'description'),
    capacity
  };
}

function validateDiscoveryQuery(query: DiscoveryQuery): DiscoveryQuery {
  const normalized: DiscoveryQuery = { ...query };
  if (normalized.game !== undefined) {
    normalized.game = requireNonEmptyString(normalized.game, 'game');
  }
  if (normalized.minRoi !== undefined) {
    normalized.minRoi = requireFiniteNumber(normalized.minRoi, 'minRoi');
  }
  if (normalized.maxPrice !== undefined) {
    normalized.maxPrice = parseNonNegativePrice(normalized.maxPrice, 'maxPrice');
  }
  if (normalized.limit !== undefined) {
    const limit = Math.trunc(requireFiniteNumber(normalized.limit, 'limit'));
    if (limit <= 0) {
      throw new Error('Invalid limit: expected a positive integer');
    }
    normalized.limit = limit;
  }
  return normalized;
}

async function verifyPaymentStub(
  buyerAgentId: string,
  strategyId: string,
  expectedPrice: number
): Promise<boolean> {
  void buyerAgentId;
  void strategyId;
  void expectedPrice;
  // Placeholder for x402 settlement hook.
  return true;
}
