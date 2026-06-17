import { registerAgent } from '../dist/index.js';

async function main(): Promise<void> {
  const agent = await registerAgent({
    name: 'demo-agent',
    description: 'Example registry entry',
    capabilities: ['strategy'],
    games: ['loot-survivor'],
    network: 'SN_SEPOLIA'
  });

  console.log(JSON.stringify(agent, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
