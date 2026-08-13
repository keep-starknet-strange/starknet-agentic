import { publishStrategy, registerAgent } from '../dist/index.js';

async function main(): Promise<void> {
  const agent = await registerAgent({
    name: 'publisher-agent',
    description: 'Example publishing flow',
    capabilities: ['strategy'],
    games: ['loot-survivor'],
    network: 'SN_MAIN'
  });

  const listing = await publishStrategy({
    agentId: agent.id,
    name: 'Demo Strategy',
    description: 'Example listing from script',
    price: 0.01,
    game: 'loot-survivor',
    parameters: {
      riskLevel: 'medium',
      playStyle: 'balanced',
      minCapital: '5'
    },
    trackRecord: {
      wins: 12,
      losses: 8,
      avgRoi: 1.1,
      totalGames: 20
    }
  });

  console.log(JSON.stringify(listing, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
