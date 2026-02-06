import runReputationTests from './tests/reputation.test.js';

console.log('🧪 Reputation Registry E2E Tests (Sepolia)\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  // Add delay to ensure any pending transactions from previous runs are cleared
  console.log('⏳ Waiting 15 seconds for network sync...\n');
  await new Promise(resolve => setTimeout(resolve, 15000));

  try {
    const results = await runReputationTests();
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    REPUTATION TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}\n`);
    
    if (results.failed === 0) {
      console.log('🎉 ALL REPUTATION TESTS PASSED!');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Please review and fix.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test suite encountered an error:\n');
    console.error(error);
    process.exit(1);
  }
}

main();

