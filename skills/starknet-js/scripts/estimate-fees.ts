/**
 * Estimate transaction fees on Starknet using starknet.js
 *
 * Usage:
 *   npx ts-node estimate-fees.ts --rpc <url> --account <address> --private-key <hex> --calls <json>
 *
 * Example:
 *   npx ts-node estimate-fees.ts \
 *     --rpc https://starknet-sepolia.public.blastapi.io/rpc/v0_8 \
 *     --account 0x123... \
 *     --private-key 0xabc... \
 *     --calls '[{"to":"0x...","entrypoint":"transfer","calldata":["0x...","100","0"]}]'
 */

import { RpcProvider, Account, CallData } from 'starknet';

interface CallInput {
  to: string;
  entrypoint: string;
  calldata: string[];
}

async function estimateFees(
  rpcUrl: string,
  accountAddress: string,
  privateKey: string,
  callsJson: string
) {
  const provider = await RpcProvider.create({ nodeUrl: rpcUrl });

  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey,
  });

  const callsData: CallInput[] = JSON.parse(callsJson);
  const calls = callsData.map((call) => ({
    contractAddress: call.to,
    entrypoint: call.entrypoint,
    calldata: call.calldata,
  }));

  const fee = await account.estimateInvokeFee(calls);

  console.log('\nFee Estimation Results:');
  console.log('='.repeat(50));
  console.log(`Overall fee: ${fee.overall_fee}`);
  console.log(`Unit: ${fee.unit}`);

  if (fee.resourceBounds) {
    console.log('\nResource Bounds (V3):');
    const rb = fee.resourceBounds;
    if (rb.l1_gas) {
      console.log(`  L1 gas: amount=${rb.l1_gas.max_amount}, price=${rb.l1_gas.max_price_per_unit}`);
    }
    if (rb.l2_gas) {
      console.log(`  L2 gas: amount=${rb.l2_gas.max_amount}, price=${rb.l2_gas.max_price_per_unit}`);
    }
    if (rb.l1_data_gas) {
      console.log(`  L1 data gas: amount=${rb.l1_data_gas.max_amount}, price=${rb.l1_data_gas.max_price_per_unit}`);
    }
  }
}

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) {
    console.error(`Missing required argument: --${name}`);
    process.exit(1);
  }
  return args[idx + 1];
}

const rpc = getArg('rpc');
const account = getArg('account');
const privateKey = getArg('private-key');
const calls = getArg('calls');

estimateFees(rpc, account, privateKey, calls).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
