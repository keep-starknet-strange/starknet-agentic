/**
 * Agent Registry - ERC-8004 Integration
 * Register agents in the marketplace with on-chain identity
 */

import { randomBytes } from 'node:crypto';
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

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
type RegistryState = { agents: Map<string, RegisteredAgent> };

/**
 * Gets or initializes the global registry state.
 * Uses globalThis to persist state across module reloads in tests.
 * @returns The registry state containing the agents map
 */
function getRegistryState(): RegistryState {
  const globalState = globalThis as typeof globalThis & {
    __strategyMarketplaceRegistryState?: RegistryState;
  };
  if (!globalState.__strategyMarketplaceRegistryState) {
    globalState.__strategyMarketplaceRegistryState = {
      agents: new Map<string, RegisteredAgent>()
    };
  }
  return globalState.__strategyMarketplaceRegistryState;
}

/**
 * Register an agent in the marketplace
 * This creates an ERC-8004 identity for the agent
 */
export async function registerAgent(config: AgentRegistration): Promise<RegisteredAgent> {
  const { name, description, capabilities, games, network } = validateRegistrationInput(config);
  
  // In production: call ERC-8004 contract to mint identity
  // For now, simulate with local storage + mock on-chain
  
  const agent: RegisteredAgent = {
    id: generateAgentId(),
    address: getCurrentAgentAddress(),
    network,
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
  const normalizedAgentId = requireNonEmptyString(agentId, 'agentId');
  const agents = await getStoredAgents();
  return agents.find(a => a.id === normalizedAgentId) || null;
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
  const normalizedAgentId = requireNonEmptyString(agentId, 'agentId');
  const agent = await getAgent(normalizedAgentId);
  if (!agent) {
    throw new Error(`Agent not found: ${normalizedAgentId}`);
  }

  const validatedUpdates = validateUpdateInput(updates);
  const updated = { ...agent, ...validatedUpdates };
  await storeAgent(updated);
  
  return updated;
}

// Helper functions (placeholder implementations)

/**
 * Generates a unique agent ID.
 * In production, uses the token_id from ERC-8004 mint transfer event.
 * Falls back to random hex string for development/testing.
 * @returns A unique agent identifier string
 */
function generateAgentId(): string {
  // In production, use token_id emitted from ERC-8004 mint transfer event.
  const mintedTokenId = process.env.ERC8004_TOKEN_ID;
  if (mintedTokenId) {
    return mintedTokenId;
  }
  return `0x${randomBytes(32).toString('hex')}`;
}

/**
 * Gets the current agent's Starknet address.
 * Validates the address format and throws in production if not set.
 * @returns The agent's Starknet address as a hex string
 * @throws Error if AGENT_ADDRESS is not set in production environment
 */
function getCurrentAgentAddress(): string {
  const address = process.env.AGENT_ADDRESS;
  if (address && /^0x[0-9a-fA-F]+$/.test(address)) {
    return address;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AGENT_ADDRESS must be set to a valid felt in production');
  }
  return `0x${'0'.repeat(64)}`;
}

/**
 * Stores an agent in the registry.
 * In production, this would persist to on-chain storage via ERC-8004 contract.
 * @param agent - The agent to store
 * @returns Promise that resolves when storage is complete
 */
async function storeAgent(agent: RegisteredAgent): Promise<void> {
  getRegistryState().agents.set(agent.id, agent);
  // In production: store on-chain via contract
  console.log(`[Registry] Stored agent: ${agent.name}`);
}

/**
 * Retrieves all stored agents from the registry.
 * @returns Promise resolving to array of all registered agents
 */
async function getStoredAgents(): Promise<RegisteredAgent[]> {
  return Array.from(getRegistryState().agents.values());
}

/**
 * Resets the registry state for testing purposes.
 * Clears all stored agents from the in-memory registry.
 * @internal Only for use in test environments
 */
export function __resetRegistryForTests(): void {
  getRegistryState().agents.clear();
}

/**
 * Validates that a string is non-empty after trimming whitespace.
 * @param value - The string to validate
 * @param field - The field name for error messages
 * @returns The trimmed string
 * @throws Error if the string is empty after trimming
 */
function requireNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return normalized;
}

/**
 * Validates that an array contains only non-empty unique strings.
 * @param values - The array to validate
 * @param field - The field name for error messages
 * @returns Array of validated unique strings
 * @throws Error if array is empty or contains invalid entries
 */
function requireStringArray(values: string[], field: string): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty array`);
  }

  const normalized = values.map((entry, idx) => {
    if (typeof entry !== 'string') {
      throw new Error(`Invalid ${field}[${idx}]: expected a string`);
    }
    return requireNonEmptyString(entry, `${field}[${idx}]`);
  });

  return [...new Set(normalized)];
}

/**
 * Validates and normalizes agent registration input.
 * Checks name format, description, capabilities, and games array.
 * @param config - The registration configuration to validate
 * @returns Validated and normalized registration config
 * @throws Error if any field fails validation
 */
function validateRegistrationInput(config: AgentRegistration): AgentRegistration {
  const name = requireNonEmptyString(config.name, 'name');
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error('Invalid name: expected lowercase letters, numbers, and hyphens (1-64 chars)');
  }

  const description = requireNonEmptyString(config.description, 'description');
  const capabilities = requireStringArray(config.capabilities, 'capabilities');
  const games = requireStringArray(config.games, 'games');

  return {
    ...config,
    name,
    description,
    capabilities,
    games
  };
}

/**
 * Validates and normalizes agent update input.
 * Only validates fields that are present in the updates object.
 * @param updates - Partial updates to validate
 * @returns Validated updates object
 * @throws Error if any provided field fails validation
 */
function validateUpdateInput(
  updates: Partial<Pick<AgentRegistration, 'capabilities' | 'games'>>
): Partial<Pick<AgentRegistration, 'capabilities' | 'games'>> {
  const validated: Partial<Pick<AgentRegistration, 'capabilities' | 'games'>> = {};

  if (updates.capabilities !== undefined) {
    validated.capabilities = requireStringArray(updates.capabilities, 'capabilities');
  }
  if (updates.games !== undefined) {
    validated.games = requireStringArray(updates.games, 'games');
  }

  return validated;
}
