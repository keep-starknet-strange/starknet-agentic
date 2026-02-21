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
  price: string;
  game: string;
  parameters: StrategyListing['parameters'];
  trackRecord: StrategyListing['trackRecord'];
}): Promise<StrategyListing> {
  const agent = await getAgent(config.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${config.agentId}`);
  }
  
  // Check certification requirements
  const certified = await checkCertification(config.agentId, config.trackRecord);
  
  const listing: StrategyListing = {
    id: generateListingId(),
    agentId: config.agentId,
    agentName: agent.name,
    name: config.name,
    description: config.description,
    price: config.price,
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
  
  // Apply filters
  if (query.game) {
    listings = listings.filter(l => l.game === query.game);
  }
  if (query.minRoi) {
    listings = listings.filter(l => l.trackRecord.avgRoi >= query.minRoi!);
  }
  if (query.maxPrice) {
    listings = listings.filter(l => parseFloat(l.price) <= query.maxPrice!);
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
      listings.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
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
  
  console.log(`[Marketplace] Purchased: ${strategy.name} by ${request.buyerAgentId}`);
  
  return access;
}

/**
 * Offer agent as a service
 */
export async function offerService(config: {
  agentId: string;
  serviceName: string;
  description: string;
  price: string;
  capacity: number;
}): Promise<ServiceOffering> {
  const agent = await getAgent(config.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${config.agentId}`);
  }
  
  const offering: ServiceOffering = {
    id: generateOfferingId(),
    agentId: config.agentId,
    serviceName: config.serviceName,
    description: config.description,
    price: config.price,
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
