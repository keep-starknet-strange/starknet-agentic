#!/usr/bin/env tsx
/**
 * Set/Update Agent Metadata on ERC-8004 Identity Registry
 *
 * Usage: npx tsx scripts/set-metadata.ts <AGENT_ID> <KEY> <VALUE>
 * Requires .env with STARKNET_RPC_URL, AGENT_PRIVATE_KEY, AGENT_ADDRESS, IDENTITY_REGISTRY_ADDRESS
 *
 * Special: Use key "caps" with a JSON array value to set Agent Passport capabilities.
 * Example: npx tsx scripts/set-metadata.ts 1 caps '["swap","stake","lend"]'
 */

import 'dotenv/config';
import { RpcProvider, Account, CallData, byteArray } from 'starknet';

async function main() {
  const [agentIdStr, key, value] = process.argv.slice(2);
  if (!agentIdStr || !key || !value) {
    console.error('Usage: npx tsx scripts/set-metadata.ts <AGENT_ID> <KEY> <VALUE>');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/set-metadata.ts 1 agentName "MyNewName"');
    console.error('  npx tsx scripts/set-metadata.ts 1 status "paused"');
    console.error('  npx tsx scripts/set-metadata.ts 1 caps \'["swap","stake","lend"]\'');
    process.exit(1);
  }

  const rpcUrl = process.env.STARKNET_RPC_URL;
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const address = process.env.AGENT_ADDRESS;
  const registryAddress = process.env.IDENTITY_REGISTRY_ADDRESS;

  if (!rpcUrl || !privateKey || !address || !registryAddress) {
    console.error('Missing required env vars: STARKNET_RPC_URL, AGENT_PRIVATE_KEY, AGENT_ADDRESS, IDENTITY_REGISTRY_ADDRESS');
    process.exit(1);
  }

  // Validate caps format if key is "caps"
  if (key === 'caps') {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        console.error('Error: "caps" value must be a JSON array of strings');
        process.exit(1);
      }
    } catch {
      console.error('Error: "caps" value must be valid JSON');
      process.exit(1);
    }
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account(provider, address, privateKey);
  const agentId = BigInt(agentIdStr);

  console.log(`\nSetting metadata for agent #${agentId}...`);
  console.log(`  Key:   ${key}`);
  console.log(`  Value: ${value}`);

  const { transaction_hash } = await account.execute({
    contractAddress: registryAddress,
    entrypoint: 'set_metadata',
    calldata: CallData.compile({
      agent_id: agentId,
      key: byteArray.byteArrayFromString(key),
      value: byteArray.byteArrayFromString(value),
    }),
  });

  console.log(`\n  Transaction: ${transaction_hash}`);
  console.log('  Waiting for confirmation...');

  const receipt = await provider.waitForTransaction(transaction_hash);
  console.log(`  Status: ${receipt.statusReceipt}`);
  console.log('\nMetadata updated successfully!');
}

main().catch(console.error);
