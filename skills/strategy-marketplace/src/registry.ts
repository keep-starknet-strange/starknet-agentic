/**
 * Agent Registry - ERC-8004 Integration
 * Register agents in the marketplace with on-chain identity
 */

import type { AgentRegistration, RegisteredAgent } from './types';

// Marketplace contract addresses (placeholder - deploy later)
const MARKETPLACE_CONTRACTS = {
  SN_MAIN: {
    registry: '0x...', // ERC-8004 registry
    marketplace: '0x...'
  },
  SN_SEPOLIA: {
    registry: '0x...',
    marketplace: '0x...'
  }
};

/**
 * Register an agent in the marketplace
 * This creates an ERC-8004 identity for the agent
 */
export async function registerAgent(config: AgentRegistration): Promise<RegisteredAgent> {
  const { name, description, capabilities, games, network } = config;
  
  // In production: call ERC-8004 contract to mint identity
  // For now, simulate with local storage + mock on-chain
  
  const agent: RegisteredAgent = {
    id: generateAgentId(),
    address: getCurrentAgentAddress(),
    name,
    description,
    capabilities,
    games,
    registeredAt: Date.now()
  };
  
  // Store locally for demo
  await storeAgent(agent);
  
  console.log(`[Strategy Marketplace] Registered agent: ${name} (${agent.id})`);
  
  return agent;
}

/**
 * Get agent details by ID
 */
export async function getAgent(agentId: string): Promise<RegisteredAgent | null> {
  const agents = await getStoredAgents();
  return agents.find(a => a.id === agentId) || null;
}

/**
 * Get all registered agents
 */
export async function listAgents(): Promise<RegisteredAgent[]> {
  return getStoredAgents();
}

/**
 * Update agent capabilities
 */
export async function updateAgent(
  agentId: string, 
  updates: Partial<Pick<AgentRegistration, 'capabilities' | 'games'>>
): Promise<RegisteredAgent> {
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  
  const updated = { ...agent, ...updates };
  await storeAgent(updated);
  
  return updated;
}

// Helper functions (placeholder implementations)

function generateAgentId(): string {
  // In production: use actual ERC-8004 mint event
  return '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
}

function getCurrentAgentAddress(): string {
  // Get from starknet-agentic context
  return process.env.AGENT_ADDRESS || '0x...';
}

async function storeAgent(agent: RegisteredAgent): Promise<void> {
  const agents = await getStoredAgents();
  const idx = agents.findIndex(a => a.id === agent.id);
  if (idx >= 0) {
    agents[idx] = agent;
  } else {
    agents.push(agent);
  }
  // In production: store on-chain via contract
  console.log(`[Registry] Stored agent: ${agent.name}`);
}

async function getStoredAgents(): Promise<RegisteredAgent[]> {
  // In production: query from on-chain
  return [];
}
