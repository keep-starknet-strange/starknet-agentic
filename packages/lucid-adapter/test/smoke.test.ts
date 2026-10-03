import { describe, it, expect } from 'vitest';
import { LucidStarknetPaymentAdapter } from '../src/adapter.js';
import { SessionOperationalWallet } from '../src/sessionWallet.js';
import { RpcProvider, Account } from 'starknet';

describe('Lucid STRK payment smoke', () => {
  it('produces receipt with traceability', async () => {
    const provider = new RpcProvider({ nodeUrl: 'http://localhost' });
    const account = new Account(provider, '0x1', '0x1');
    const adapter = new LucidStarknetPaymentAdapter(provider, account);
    const session = new SessionOperationalWallet({ owner: '0x1', sessionSalt: 'test', validUntil: Date.now() + 60000 });
    const receipt = await adapter.executePaidTool({
      toolId: 'test',
      priceStrk: '0.001',
      policyId: 'p1',
      recipient: '0x2'
    }, session);
    expect(receipt.requestId).toBeDefined();
    expect(receipt.policyDecision).toBe('allow');
    expect(receipt.txHash).toBeDefined();
    expect(receipt.amountStrk).toBe('0.001');
  });
});
