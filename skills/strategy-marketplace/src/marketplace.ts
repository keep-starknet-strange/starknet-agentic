/**
 * Strategy Marketplace
 * Publish, discover, and purchase strategies
 */

import type { 
  StrategyListing, 
  ServiceOffering, 
  DiscoveryQuery,
  PurchaseRequest,
  PurchaseResult
} from './types';
import { getAgent } from './registry';

const LISTINGS: StrategyListing[] = [];
const OFFERINGS: ServiceOffering[] = [];

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
  const agent = await getAgent(config.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${config.agentId}`);
  }

  const validatedPrice = parseNonNegativePrice(config.price, 'strategy price');
  
  // Check certification requirements
  const certified = await checkCertification(config.agentId, config.trackRecord);
  
  const listing: StrategyListing = {
    id: generateListingId(),
    agentId: config.agentId,
    agentName: agent.name,
    name: config.name,
    description: config.description,
    price: validatedPrice,
    game: config.game,
    parameters: config.parameters,
    trackRecord: config.trackRecord,
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
  let listings = await getAllListings();
  const { game, minRoi, maxPrice } = query;
  
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
  switch (query.sortBy) {
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
  
  return listings.slice(0, query.limit || 20);
}

/**
 * Get strategy details
 */
export async function getStrategy(strategyId: string): Promise<StrategyListing | null> {
  const listings = await getAllListings();
  return listings.find(l => l.id === strategyId) || null;
}

/**
 * Purchase/rent a strategy
 */
export async function purchaseStrategy(request: PurchaseRequest): Promise<PurchaseResult> {
  const strategy = await getStrategy(request.strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${request.strategyId}`);
  }

  const buyer = await getAgent(request.buyerAgentId);
  if (!buyer) {
    throw new Error(`Buyer agent not found: ${request.buyerAgentId}`);
  }
  
  // In production: process x402 payment here
  // await processPayment(buyer, strategy.price);
  
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
  const agent = await getAgent(config.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${config.agentId}`);
  }

  const validatedPrice = parseNonNegativePrice(config.price, 'service price');
  
  const offering: ServiceOffering = {
    id: generateOfferingId(),
    agentId: config.agentId,
    serviceName: config.serviceName,
    description: config.description,
    price: validatedPrice,
    capacity: config.capacity,
    active: true
  };
  
  await storeOffering(offering);
  
  return offering;
}

/**
 * Get services for an agent
 */
export async function getAgentServices(agentId: string): Promise<ServiceOffering[]> {
  const offerings = await getAllOfferings();
  return offerings.filter(o => o.agentId === agentId);
}

// Helper functions

async function checkCertification(agentId: string, trackRecord: StrategyListing['trackRecord']): Promise<boolean> {
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
  return 'strat_' + Math.random().toString(36).slice(2, 12);
}

function generateOfferingId(): string {
  return 'svc_' + Math.random().toString(36).slice(2, 12);
}

function generateAccessId(): string {
  return 'acc_' + Math.random().toString(36).slice(2, 12);
}

function parseNonNegativePrice(value: string | number, label: string): number {
  const price = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Invalid ${label}: expected a non-negative number`);
  }
  return price;
}

async function storeListing(listing: StrategyListing): Promise<void> {
  const idx = LISTINGS.findIndex(item => item.id === listing.id);
  if (idx >= 0) {
    LISTINGS[idx] = listing;
  } else {
    LISTINGS.push(listing);
  }
  console.log(`[Marketplace] Stored listing: ${listing.id}`);
}

async function getAllListings(): Promise<StrategyListing[]> {
  return [...LISTINGS];
}

async function storeOffering(offering: ServiceOffering): Promise<void> {
  const idx = OFFERINGS.findIndex(item => item.id === offering.id);
  if (idx >= 0) {
    OFFERINGS[idx] = offering;
  } else {
    OFFERINGS.push(offering);
  }
  console.log(`[Marketplace] Stored offering: ${offering.id}`);
}

async function getAllOfferings(): Promise<ServiceOffering[]> {
  return [...OFFERINGS];
}

export function __resetMarketplaceForTests(): void {
  LISTINGS.length = 0;
  OFFERINGS.length = 0;
}
