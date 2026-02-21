import { beforeEach, describe, expect, it } from 'bun:test';
import { __resetRegistryForTests, getAgent, listAgents, registerAgent, updateAgent } from './registry';
import {
  __resetMarketplaceForTests,
  discoverStrategies,
  getAgentServices,
  offerService,
  publishStrategy,
  purchaseStrategy
} from './marketplace';
import { __resetTrackingForTests, getAgentStats, getTopStrategies, trackPerformance } from './tracking';

describe('strategy marketplace skill', () => {
  beforeEach(() => {
    __resetRegistryForTests();
    __resetTrackingForTests();
    __resetMarketplaceForTests();
  });

  it('registers and updates an agent', async () => {
    const agent = await registerAgent({
      name: 'loot-survivor-pro',
      description: 'Late-game survival optimizer',
      capabilities: ['gaming', 'analysis'],
      games: ['loot-survivor'],
      network: 'SN_MAIN'
    });

    expect(agent.id.startsWith('0x')).toBeTrue();
    const listed = await listAgents();
    expect(listed.length).toBe(1);
    expect((await getAgent(agent.id))?.name).toBe('loot-survivor-pro');

    const updated = await updateAgent(agent.id, { capabilities: ['gaming'], games: ['loot-survivor', 'chess'] });
    expect(updated.capabilities).toEqual(['gaming']);
    expect(updated.games).toEqual(['loot-survivor', 'chess']);
  });

  it('tracks performance and aggregates stats', async () => {
    const agent = await registerAgent({
      name: 'arb-bot',
      description: 'ROI maximizer',
      capabilities: ['arbitrage'],
      games: ['loot-survivor'],
      network: 'SN_SEPOLIA'
    });

    await trackPerformance({
      agentId: agent.id,
      game: 'loot-survivor',
      result: 'win',
      roi: 1.8,
      strategy: 'aggressive',
      duration: 100
    });
    await trackPerformance({
      agentId: agent.id,
      game: 'loot-survivor',
      result: 'loss',
      roi: -0.2,
      strategy: 'aggressive',
      duration: 90
    });
    await trackPerformance({
      agentId: agent.id,
      game: 'loot-survivor',
      result: 'win',
      roi: 1.1,
      strategy: 'balanced',
      duration: 120
    });

    const stats = await getAgentStats(agent.id);
    expect(stats.totalGames).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.gamesByType['loot-survivor']).toBe(3);

    const topStrategies = await getTopStrategies(agent.id, 2);
    expect(topStrategies.length).toBe(2);
    expect(topStrategies[0].strategy).toBe('balanced');
  });

  it('publishes, discovers, and purchases strategies', async () => {
    const agent = await registerAgent({
      name: 'market-maker',
      description: 'Makes calibrated decisions',
      capabilities: ['strategy'],
      games: ['loot-survivor'],
      network: 'SN_MAIN'
    });

    const listing = await publishStrategy({
      agentId: agent.id,
      name: 'Low Risk Survival',
      description: 'Defensive playbook',
      price: '0.01',
      game: 'loot-survivor',
      parameters: { riskLevel: 'low', playStyle: 'defensive', minCapital: '10' },
      trackRecord: { wins: 6, losses: 4, avgRoi: 1.4, totalGames: 10 }
    });

    expect(listing.certified).toBeTrue();

    const discovered = await discoverStrategies({ game: 'loot-survivor', minRoi: 1.0, sortBy: 'roi', limit: 5 });
    expect(discovered.length).toBe(1);
    expect(discovered[0].id).toBe(listing.id);

    const purchase = await purchaseStrategy({ strategyId: listing.id, buyerAgentId: agent.id });
    expect(purchase.success).toBeTrue();
    expect(purchase.accessId.startsWith('acc_')).toBeTrue();
  });

  it('offers and lists services for an agent', async () => {
    const agent = await registerAgent({
      name: 'service-bot',
      description: 'Autonomous service provider',
      capabilities: ['service'],
      games: ['loot-survivor'],
      network: 'SN_MAIN'
    });

    const offering = await offerService({
      agentId: agent.id,
      serviceName: 'Strategy Consultation',
      description: 'Hourly coaching',
      price: '0.05',
      capacity: 8
    });

    expect(offering.active).toBeTrue();
    const services = await getAgentServices(agent.id);
    expect(services.map(service => service.id)).toContain(offering.id);
  });
});
