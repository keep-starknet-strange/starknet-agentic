/**
 * starknet-mini-pay Acceptance Test
 */

const { execSync } = require("child_process");

console.log("🧪 Starknet Mini-Pay Acceptance Test\n");

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

test("Module imports work", () => {
  execSync(`python3 -c "
import sys
sys.path.insert(0, 'skills/_integrations/starknet-mini-pay/scripts')
from mini_pay import MiniPay, MiniPayError
print('OK')
"`, { encoding: "utf8" });
});

test("CLI help runs", () => {
  execSync("python3 skills/_integrations/starknet-mini-pay/scripts/cli.py --help", { encoding: "utf8" });
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
