import runIdentityTests from './tests/identity.test.js';
import runReputationTests from './test-oz-reputation.js';
import runValidationTests from './tests/validation.test.js';

console.log('🧪 ERC-8004 E2E Test Suite\n');
console.log('Running all end-to-end tests on Sepolia testnet...\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  // Add delay to ensure any pending transactions from previous runs are cleared
  console.log('⏳ Waiting 5 seconds for network sync...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  let totalPassed = 0;
  let totalFailed = 0;

  // Run Identity Registry Tests
  const identityResults = await runIdentityTests();
  totalPassed += identityResults.passed;
  totalFailed += identityResults.failed;

  // Delay between test suites for network sync
  console.log('\n⏳ Waiting 10 seconds for network sync between test suites...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Run Reputation Registry Tests
  const reputationResults = await runReputationTests();
  totalPassed += reputationResults.passed;
  totalFailed += reputationResults.failed;

  // Delay between test suites for network sync
  console.log('\n⏳ Waiting 10 seconds for network sync between test suites...\n');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Run Validation Registry Tests
  const validationResults = await runValidationTests();
  totalPassed += validationResults.passed;
  totalFailed += validationResults.failed;

  // Final Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    FINAL RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log('');
  
  if (totalFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! Production ready for deployment.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review and fix before deploying.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Test suite encountered an error:\n');
  console.error(error);
  process.exit(1);
});

