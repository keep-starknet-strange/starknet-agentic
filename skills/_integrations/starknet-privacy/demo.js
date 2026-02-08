/**
 * starknet-privacy acceptance test
 * Run: node skills/_integrations/starknet-privacy/demo.js
 */

const { execSync } = require('child_process');

console.log('🧪 Starknet Privacy Pool Acceptance Test\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

// Test 1: Python module imports
test('Module imports work', () => {
  const result = execSync(`python3 -c "
import sys
sys.path.insert(0, 'skills/_integrations/starknet-privacy/scripts')
from starknet_privacy import PrivacyPool
print('OK')
"`, { encoding: 'utf8' }).trim();
  if (result !== 'OK') throw new Error('Import failed');
});

// Test 2: Commitment creation
test('Commitment generation works', () => {
  execSync(`python3 -c "
import sys
sys.path.insert(0, 'skills/_integrations/starknet-privacy/scripts')
from starknet_privacy import PrivacyPool
pool = PrivacyPool()
commitment = pool.create_commitment('0x123', 100)
assert commitment is not None
print('OK')
"`, { encoding: 'utf8' });
});

// Test 3: Merkle proof
test('Merkle proof generation works', () => {
  execSync(`python3 -c "
import sys
sys.path.insert(0, 'skills/_integrations/starknet-privacy/scripts')
from starknet_privacy import PrivacyPool
pool = PrivacyPool()
proof = pool.get_merkle_proof('test')
assert proof is not None
print('OK')
"`, { encoding: 'utf8' });
});

// Test 4: Node.js module exists
test('Node.js module exists', () => {
  const fs = require('fs');
  const path = require('path');
  const modulePath = path.join(__dirname, 'skills/_integrations/starknet-privacy/scripts/starknet-privacy.js');
  if (!fs.existsSync(modulePath)) throw new Error('starknet-privacy.js not found');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All acceptance tests passed!');
  console.log('\nFiles:');
  console.log('  - skills/_integrations/starknet-privacy/scripts/starknet-privacy.js');
  console.log('  - skills/_integrations/starknet-privacy/zk_circuits/privacy_pool_production.circom');
  console.log('  - skills/_integrations/starknet-privacy/tests/test_privacy_pool.py');
  process.exit(0);
}
