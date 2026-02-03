#!/usr/bin/env node
import { Provider } from 'starknet';

const rpcUrl = process.env.STARKNET_RPC_URL || 'https://rpc.starknet.lava.build:443';
const address = process.argv[2];
const deployedAtIso = process.argv[3];

if (!address || !deployedAtIso) {
  console.error('Usage: node find-deploy-tx.js <address> <deployedAtIso>');
  process.exit(1);
}

const targetTs = Math.floor(new Date(deployedAtIso).getTime() / 1000);

const provider = new Provider({ nodeUrl: rpcUrl });

async function main() {
  const latest = await provider.getBlock('latest');
  let lo = 0;
  let hi = latest.block_number;

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const b = await provider.getBlock(mid);
    const ts = b.timestamp;
    if (ts < targetTs) lo = mid;
    else hi = mid;
  }

  // scan window around closest block (keep tight for speed)
  const scanStart = Math.max(0, lo - 25);
  const scanEnd = Math.min(latest.block_number, lo + 25);

  const want = address.toLowerCase();
  const CONCURRENCY = 12;

  for (let n = scanStart; n <= scanEnd; n++) {
    const b = await provider.getBlockWithTxHashes(n);
    const hashes = b.transactions;

    for (let i = 0; i < hashes.length; i += CONCURRENCY) {
      const chunk = hashes.slice(i, i + CONCURRENCY);
      const receipts = await Promise.all(
        chunk.map(async (h) => {
          try {
            const r = await provider.getTransactionReceipt(h);
            const contractAddr = (r.contract_address || r.deployed_contract_address || r.address || '').toLowerCase?.() || '';
            return { h, contractAddr };
          } catch {
            return null;
          }
        }),
      );

      for (const item of receipts) {
        if (!item) continue;
        if (item.contractAddr === want) {
          console.log(JSON.stringify({ ok: true, address, txHash: item.h, block: n, blockTs: b.timestamp }, null, 2));
          return;
        }
      }
    }
  }

  console.log(JSON.stringify({ ok: false, address, error: 'not_found_in_scanned_window', scanned: { from: scanStart, to: scanEnd }, targetTs }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e?.message || String(e), stack: e?.stack }, null, 2));
  process.exit(1);
});
