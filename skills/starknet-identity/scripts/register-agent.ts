#!/usr/bin/env tsx
/**
 * Register Agent on ERC-8004 Identity Registry
 *
 * Usage: npx tsx scripts/register-agent.ts "MyAgent" "defi" "1.0"
 * Requires .env with STARKNET_RPC_URL, AGENT_PRIVATE_KEY, AGENT_ADDRESS, IDENTITY_REGISTRY_ADDRESS
 */

import 'dotenv/config';
import { RpcProvider, Account, CallData, byteArray } from 'starknet';

// MetadataEntry is a struct { key: ByteArray, value: ByteArray }
const IDENTITY_REGISTRY_ABI = [
  {
    type: 'struct',
    name: 'core::byte_array::ByteArray',
    members: [
      { name: 'data', type: 'core::array::Array::<core::bytes_31::bytes31>' },
      { name: 'pending_word', type: 'core::felt252' },
      { name: 'pending_word_len', type: 'core::integer::u32' },
    ],
  },
  {
    type: 'struct',
    name: 'erc8004_cairo::interfaces::identity_registry::MetadataEntry',
    members: [
      { name: 'key', type: 'core::byte_array::ByteArray' },
      { name: 'value', type: 'core::byte_array::ByteArray' },
    ],
  },
  {
    type: 'function',
    name: 'register_with_metadata',
    inputs: [
      { name: 'token_uri', type: 'core::byte_array::ByteArray' },
      { name: 'metadata', type: 'core::array::Array::<erc8004_cairo::interfaces::identity_registry::MetadataEntry>' },
    ],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'external',
  },
  {
    type: 'function',
    name: 'total_agents',
    inputs: [],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'view',
  },
];

async function main() {
  const [name, agentType, version] = process.argv.slice(2);
  if (!name) {
    console.error('Usage: npx tsx scripts/register-agent.ts <NAME> [TYPE] [VERSION]');
    console.error('Example: npx tsx scripts/register-agent.ts "MyTradingAgent" "defi" "1.0.0"');
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

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account(provider, address, privateKey);

  // Build metadata as Array<MetadataEntry> — each entry is a struct { key, value }
  const metadata = [
    { key: 'agentName', value: name },
    { key: 'agentType', value: agentType || 'general' },
    { key: 'version', value: version || '1.0.0' },
    { key: 'status', value: 'active' },
  ];

  console.log(`\nRegistering agent "${name}" on ERC-8004...`);
  console.log(`  Type: ${agentType || 'general'}`);
  console.log(`  Version: ${version || '1.0.0'}`);
  console.log(`  Registry: ${registryAddress}`);

  const { transaction_hash } = await account.execute({
    contractAddress: registryAddress,
    entrypoint: 'register_with_metadata',
    calldata: CallData.compile({
      token_uri: byteArray.byteArrayFromString(`agent://${name}`),
      metadata: metadata.map(m => ({
        key: byteArray.byteArrayFromString(m.key),
        value: byteArray.byteArrayFromString(m.value),
      })),
    }),
  });

  console.log(`\n  Transaction: ${transaction_hash}`);
  console.log('  Waiting for confirmation...');

  const receipt = await provider.waitForTransaction(transaction_hash);
  console.log(`  Status: ${receipt.statusReceipt}`);
  console.log('\nAgent registered successfully!');
}

main().catch(console.error);
