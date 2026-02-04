#!/usr/bin/env tsx
/**
 * Manual test: Verify LORDS token is fetched via avnu SDK
 *
 * This test verifies that:
 * 1. LORDS (not in static list) is resolved via avnu SDK
 * 2. Token info is cached after first fetch
 * 3. Static tokens (ETH, STRK) don't trigger avnu calls
 *
 * Run: npx tsx __tests__/services/TokenService.manual.ts
 */

import { TokenService } from "../../src/services/TokenService.js";

async function main() {
  const service = new TokenService();

  console.log("=== TokenService Manual Test ===\n");

  // Test 1: Static tokens
  console.log("1. Static tokens (no network calls):");
  console.log(`   ETH decimals: ${service.getDecimals("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7")}`);
  console.log(`   STRK address: ${service.resolveSymbol("STRK")}`);
  console.log(`   Cache size: ${service.getCacheSize()} (should be 4)\n`);

  // Test 2: Fetch LORDS via avnu
  console.log("2. Fetching LORDS token via avnu SDK...");
  try {
    const lords = await service.getTokenBySymbol("LORDS");
    console.log(`   Symbol: ${lords.symbol}`);
    console.log(`   Name: ${lords.name}`);
    console.log(`   Address: ${lords.address}`);
    console.log(`   Decimals: ${lords.decimals}`);
    console.log(`   Tags: ${lords.tags.join(", ")}`);
    console.log(`   isStatic: ${lords.isStatic} (should be false)`);
    console.log(`   Cache size: ${service.getCacheSize()} (should be 5)\n`);
  } catch (error) {
    console.error(`   ERROR: ${error instanceof Error ? error.message : error}\n`);
  }

  // Test 3: Second fetch should use cache
  console.log("3. Second fetch (should use cache, no network):");
  try {
    const cachedLords = await service.getTokenInfoAsync("LORDS");
    console.log(`   Cached: ${cachedLords.symbol} @ ${cachedLords.address}`);
    console.log(`   lastUpdated: ${new Date(cachedLords.lastUpdated).toISOString()}\n`);
  } catch {
    console.log("   ERROR: LORDS not in cache!\n");
  }

  // Test 4: Fetch by address
  console.log("4. Fetch ZEND by address via avnu...");
  try {
    const zend = await service.getTokenByAddress("0x00585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34");
    console.log(`   Symbol: ${zend.symbol}`);
    console.log(`   Name: ${zend.name}`);
    console.log(`   Decimals: ${zend.decimals}`);
    console.log(`   Cache size: ${service.getCacheSize()} (should be 6)\n`);
  } catch (error) {
    console.error(`   ERROR: ${error instanceof Error ? error.message : error}\n`);
  }

  // Summary
  console.log("=== Summary ===");
  console.log(`Total cached tokens: ${service.getCacheSize()}`);
  console.log("All cached tokens:");
  for (const token of service.getAllCached()) {
    console.log(`  ${token.symbol.padEnd(6)} | ${token.decimals} decimals | static=${token.isStatic}`);
  }
}

main().catch(console.error);
