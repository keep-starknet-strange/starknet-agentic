#!/usr/bin/env node
/**
 * starknet-mini-pay Acceptance Test
 * Run: node skills/_integrations/starknet-mini-pay/demo.js
 */

const { execSync } = require("child_process");
const path = require("path");

console.log("🧪 Starknet Mini-Pay Acceptance Test\n");

let passed = 0, failed = 0;

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

const skillRoot = path.resolve(__dirname, "..");
const scriptsPath = path.resolve(__dirname, "scripts");

test("Module imports work", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from mini_pay import MiniPay, MiniPayError, TransferResult; print('OK')"`);
});

test("CLI help runs", () => {
  execSync(`python3 ${scriptsPath}/cli.py --help`);
});

test("Payment link builder imports", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from link_builder import PaymentLinkBuilder; print('OK')"`);
});

test("QR generator imports", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from qr_generator import QRGenerator; print('OK')"`);
});

test("Invoice manager imports", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from invoice import InvoiceManager; print('OK')"`);
});

test("Tokens configured correctly", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from mini_pay import MAINNET_TOKENS; assert 'ETH' in MAINNET_TOKENS; print('OK')"`);
});

test("Custom error classes exist", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from mini_pay import MiniPayError, InvalidAddressError, InsufficientBalanceError; print('OK')"`);
});

test("TransferResult class works", () => {
  execSync(`python3 -c "import sys; sys.path.insert(0, '${scriptsPath}'); from mini_pay import TransferResult; r = TransferResult('0x123', 'submitted'); assert r.tx_hash == '0x123'; print('OK')"`);
});

console.log("\n" + "=".repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.log("\n❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("\n✅ All acceptance tests passed!");
  process.exit(0);
}
