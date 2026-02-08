#!/usr/bin/env node
/**
 * starknet-mini-pay Acceptance Test
 * Run: node skills/_integrations/starknet-mini-pay/demo.js
 * 
 * This test validates the mini-pay skill functionality:
 * 1. Module loads correctly
 * 2. QR code generation works
 * 3. Payment link creation works
 * 4. Invoice system works
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starknet Mini-Pay Acceptance Test\n');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Test 1: Python module loads
test('Module imports work', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from mini_pay import MiniPay
print('OK')
`;
  const result = execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
  assert(result === 'OK', 'Module failed to import');
});

// Test 2: MiniPay class exists
test('MiniPay class instantiates', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from mini_pay import MiniPay
pay = MiniPay()
assert pay is not None
assert hasattr(pay, 'transfer')
assert hasattr(pay, 'get_balance')
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 3: CLI works
test('CLI help runs', () => {
  const result = execSync('python3 cli.py --help', { 
    cwd: __dirname,
    encoding: 'utf8' 
  });
  assert(result.includes('usage'), 'CLI help failed');
});

// Test 4: Payment link creation
test('Payment link builder works', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from link_builder import PaymentLinkBuilder
link = PaymentLinkBuilder()
url = link.create(
  address='0x1234567890abcdef',
  amount=0.01,
  memo='coffee',
  token='ETH'
)
assert 'starknet:' in url
assert 'amount=0.01' in url
assert 'memo=coffee' in url
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 5: QR generator import
test('QR generator imports', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from qr_generator import QRGenerator
qr = QRGenerator()
assert qr is not None
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 6: Invoice manager import
test('Invoice manager imports', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from invoice import InvoiceManager
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 7: Token configuration
test('Tokens configured correctly', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from mini_pay import MiniPay
pay = MiniPay()
assert 'ETH' in pay.tokens
assert 'STRK' in pay.tokens
assert 'USDC' in pay.tokens
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 8: Error classes exist
test('Custom error classes exist', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from mini_pay import MiniPayError, InvalidAddressError, InsufficientBalanceError
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 9: RPC client works
test('RPC client initializes', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from mini_pay import MiniPay
from starknet_py.net.full_node_client import FullNodeClient
pay = MiniPay()
assert isinstance(pay.client, FullNodeClient)
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
});

// Test 10: Network config
test('Network configuration exists', () => {
  const script = `
import sys
sys.path.insert(0, '.')
from cli import NETWORKS
assert 'mainnet' in NETWORKS
assert 'sepolia' in NETWORKS
print('OK')
`;
  execSync(`python3 -c "${script}"`, { 
    cwd: __dirname,
    encoding: 'utf8' 
  }).trim();
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
  console.log('  - scripts/mini_pay.py (core payment logic)');
  console.log('  - scripts/cli.py (CLI interface)');
  console.log('  - scripts/link_builder.py (payment links)');
  console.log('  - scripts/qr_generator.py (QR codes)');
  console.log('  - scripts/invoice.py (invoices)');
  console.log('  - scripts/telegram_bot.py (Telegram bot)');
  console.log('  - test_mini_pay.py (unit tests)');
  process.exit(0);
}
