/**
 * Compute Starknet account address before deployment using starknet.js
 *
 * Usage:
 *   npx ts-node compute-account-address.ts --public-key <hex> [--account-type oz|argent]
 *   npx ts-node compute-account-address.ts --private-key <hex> [--account-type oz|argent]
 */

import { hash, ec, stark, CallData } from 'starknet';

// Common class hashes by account type
const CLASS_HASHES: Record<string, string> = {
  oz: '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688',
  argent: '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f',
};

function computeAddress(publicKey: string, accountType: string, classHash?: string) {
  const resolvedClassHash = classHash || CLASS_HASHES[accountType];
  if (!resolvedClassHash) {
    console.error(`Unknown account type: ${accountType}`);
    process.exit(1);
  }

  let constructorCalldata: string[];
  if (accountType === 'argent') {
    constructorCalldata = CallData.compile({ owner: publicKey, guardian: 0 });
  } else {
    constructorCalldata = CallData.compile({ publicKey });
  }

  const address = hash.calculateContractAddressFromHash(
    publicKey,
    resolvedClassHash,
    constructorCalldata,
    0
  );

  return { address, classHash: resolvedClassHash, constructorCalldata };
}

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const privateKeyArg = getArg('private-key');
const publicKeyArg = getArg('public-key');
const accountType = getArg('account-type') || 'oz';
const classHashArg = getArg('class-hash');

if (!privateKeyArg && !publicKeyArg) {
  console.error('Provide either --private-key or --public-key');
  process.exit(1);
}

let publicKey: string;
if (privateKeyArg) {
  publicKey = ec.starkCurve.getStarkKey(privateKeyArg);
  console.log(`Derived public key: ${publicKey}`);
} else {
  publicKey = publicKeyArg!;
}

const result = computeAddress(publicKey, accountType, classHashArg);

console.log(`\nAccount type: ${accountType}`);
console.log(`Class hash: ${result.classHash}`);
console.log(`Computed address: ${result.address}`);
console.log(`\nNext steps:`);
console.log(`1. Fund this address with STRK`);
console.log(`2. Deploy with classHash=${result.classHash}, salt=${publicKey}`);
