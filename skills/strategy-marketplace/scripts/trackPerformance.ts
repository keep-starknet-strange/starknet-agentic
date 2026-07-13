import { registerAgent, trackPerformance } from '../dist/index.js';

async function main(): Promise<void> {
  const agent = await registerAgent({
    name: 'tracker-agent',
    description: 'Example tracking flow',
    capabilities: ['analytics'],
    games: ['loot-survivor'],
    network: 'SN_SEPOLIA'
  });

  await trackPerformance({
    agentId: agent.id,
    game: 'loot-survivor',
    result: 'win',
    roi: 1.25,
    strategy: 'balanced',
    duration: 900
  });

  console.log(`Tracked performance for ${agent.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
