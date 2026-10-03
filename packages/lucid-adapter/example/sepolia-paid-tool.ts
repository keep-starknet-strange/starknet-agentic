import { RpcProvider, Account, ec } from 'starknet';
import { LucidStarknetPaymentAdapter } from '../src/adapter.js';
import { SessionOperationalWallet } from '../src/sessionWallet.js';

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL || 'https://starknet-sepolia.publicnode.com' });

async function main() {
  const owner = process.env.OWNER_ADDRESS!;
  const privateKey = process.env.OWNER_PRIVATE_KEY!;
  const account = new Account(provider, owner, privateKey);

  const sessionWallet = new SessionOperationalWallet({
    owner,
    sessionSalt: process.env.SESSION_SALT || 'lucid_demo',
    validUntil: Date.now() + 1000 * 60 * 60,
  });

  const adapter = new LucidStarknetPaymentAdapter(provider, account);

  const receipt = await adapter.executePaidTool({
    toolId: 'lucid.tool.search.paid',
    priceStrk: '0.001',
    policyId: 'policy_x402_starknet_01',
    recipient: process.env.RECIPIENT_ADDRESS!,
  }, sessionWallet);

  console.log('Payment receipt:', receipt);
  // Evidence artifacts
  console.log(JSON.stringify({
    requestId: receipt.requestId,
    policyDecision: receipt.policyDecision,
    txHash: receipt.txHash,
    amountStrk: receipt.amountStrk,
  }));
}

main().catch(console.error);
