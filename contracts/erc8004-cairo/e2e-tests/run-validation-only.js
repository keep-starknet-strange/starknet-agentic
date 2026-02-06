import runValidationTests from './tests/validation.test.js';

console.log('🧪 Running Validation Registry E2E Tests Only\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  // Add delay to ensure network is ready
  console.log('⏳ Waiting 5 seconds for network sync...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const results = await runValidationTests();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('');
  
  if (results.failed === 0) {
    console.log('🎉 ALL VALIDATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review and fix.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Test execution failed:\n');
  console.error(error);
  process.exit(1);
});

