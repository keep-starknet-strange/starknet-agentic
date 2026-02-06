/**
 * Starknet Wallet Integration Template (React)
 *
 * This template demonstrates browser wallet integration using:
 * - get-starknet v4 (WalletAccount)
 * - get-starknet v5 (WalletAccountV5)
 *
 * Install dependencies:
 *   npm install starknet @starknet-io/get-starknet
 */

import React, { useState, useEffect, useCallback } from 'react';
import { connect, disconnect } from '@starknet-io/get-starknet';
import { WalletAccount, Contract, cairo, type Call } from 'starknet';

// Configuration
const RPC_URL = 'https://starknet-sepolia.public.blastapi.io/rpc/v0_8';

// Example ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'felt' }],
    outputs: [{ name: 'balance', type: 'Uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'felt' },
      { name: 'amount', type: 'Uint256' },
    ],
    outputs: [{ name: 'success', type: 'felt' }],
  },
];

// STRK token address (same on mainnet and sepolia)
const STRK_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

interface WalletState {
  account: WalletAccount | null;
  address: string | null;
  chainId: string | null;
  isConnecting: boolean;
  error: string | null;
}

/**
 * Custom hook for wallet connection
 */
function useStarknetWallet() {
  const [state, setState] = useState<WalletState>({
    account: null,
    address: null,
    chainId: null,
    isConnecting: false,
    error: null,
  });

  // Connect wallet
  const connectWallet = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Open wallet selection modal
      const selectedWallet = await connect({
        modalMode: 'alwaysAsk',
        modalTheme: 'system',
      });

      if (!selectedWallet) {
        setState(prev => ({ ...prev, isConnecting: false }));
        return;
      }

      // Create WalletAccount
      const walletAccount = await WalletAccount.connect(
        { nodeUrl: RPC_URL },
        selectedWallet
      );

      const chainId = await walletAccount.getChainId();

      setState({
        account: walletAccount,
        address: walletAccount.address,
        chainId,
        isConnecting: false,
        error: null,
      });

      // Set up event listeners
      walletAccount.onAccountChange((accounts) => {
        if (accounts.length > 0) {
          setState(prev => ({ ...prev, address: accounts[0] }));
        } else {
          // User disconnected
          setState({
            account: null,
            address: null,
            chainId: null,
            isConnecting: false,
            error: null,
          });
        }
      });

      walletAccount.onNetworkChanged((newChainId) => {
        setState(prev => ({ ...prev, chainId: newChainId }));
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Failed to connect',
      }));
    }
  }, []);

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    await disconnect();
    setState({
      account: null,
      address: null,
      chainId: null,
      isConnecting: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    connectWallet,
    disconnectWallet,
  };
}

/**
 * Token Balance Component
 */
function TokenBalance({
  account,
  tokenAddress,
}: {
  account: WalletAccount;
  tokenAddress: string;
}) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBalance() {
      setLoading(true);
      try {
        const contract = new Contract(ERC20_ABI, tokenAddress, account);
        const result = await contract.balanceOf(account.address);
        // Convert from uint256 to readable format (18 decimals)
        const balanceWei = BigInt(result.low) + (BigInt(result.high) << 128n);
        const balanceFormatted = (Number(balanceWei) / 1e18).toFixed(4);
        setBalance(balanceFormatted);
      } catch (error) {
        console.error('Failed to fetch balance:', error);
        setBalance('Error');
      }
      setLoading(false);
    }

    fetchBalance();
  }, [account, tokenAddress]);

  if (loading) return <span>Loading...</span>;
  return <span>{balance} STRK</span>;
}

/**
 * Transfer Form Component
 */
function TransferForm({ account }: { account: WalletAccount }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('pending');
    setTxHash(null);

    try {
      const contract = new Contract(ERC20_ABI, STRK_ADDRESS, account);

      // Convert amount to wei (18 decimals)
      const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e18));

      // Prepare call
      const call: Call = contract.populate('transfer', {
        recipient,
        amount: cairo.uint256(amountWei),
      });

      // Execute transaction
      const { transaction_hash } = await account.execute([call]);
      setTxHash(transaction_hash);

      // Wait for confirmation
      await account.waitForTransaction(transaction_hash);
      setStatus('success');
    } catch (error) {
      console.error('Transfer failed:', error);
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleTransfer}>
      <div>
        <label>Recipient Address:</label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x..."
          required
        />
      </div>
      <div>
        <label>Amount (STRK):</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          step="0.0001"
          min="0"
          required
        />
      </div>
      <button type="submit" disabled={status === 'pending'}>
        {status === 'pending' ? 'Sending...' : 'Send'}
      </button>

      {status === 'success' && txHash && (
        <p>
          Transaction successful!{' '}
          <a
            href={`https://sepolia.voyager.online/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Voyager
          </a>
        </p>
      )}

      {status === 'error' && <p style={{ color: 'red' }}>Transaction failed</p>}
    </form>
  );
}

/**
 * Sign Message Component
 */
function SignMessage({ account }: { account: WalletAccount }) {
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState<string | null>(null);

  const handleSign = async () => {
    try {
      const typedData = {
        types: {
          StarknetDomain: [
            { name: 'name', type: 'shortstring' },
            { name: 'version', type: 'shortstring' },
            { name: 'chainId', type: 'shortstring' },
            { name: 'revision', type: 'shortstring' },
          ],
          Message: [{ name: 'content', type: 'shortstring' }],
        },
        primaryType: 'Message',
        domain: {
          name: 'MyDapp',
          version: '1',
          chainId: 'SN_SEPOLIA',
          revision: '1',
        },
        message: {
          content: message,
        },
      };

      const sig = await account.signMessage(typedData);
      setSignature(JSON.stringify(sig));
    } catch (error) {
      console.error('Signing failed:', error);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to sign"
      />
      <button onClick={handleSign}>Sign Message</button>
      {signature && (
        <div>
          <strong>Signature:</strong>
          <pre style={{ overflow: 'auto', maxWidth: '100%' }}>{signature}</pre>
        </div>
      )}
    </div>
  );
}

/**
 * Main App Component
 */
export default function StarknetDApp() {
  const {
    account,
    address,
    chainId,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
  } = useStarknetWallet();

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Starknet dApp</h1>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!account ? (
        <button onClick={connectWallet} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <p>
              <strong>Address:</strong> {address?.slice(0, 10)}...{address?.slice(-8)}
            </p>
            <p>
              <strong>Network:</strong> {chainId}
            </p>
            <p>
              <strong>Balance:</strong>{' '}
              <TokenBalance account={account} tokenAddress={STRK_ADDRESS} />
            </p>
            <button onClick={disconnectWallet}>Disconnect</button>
          </div>

          <hr />

          <h2>Transfer STRK</h2>
          <TransferForm account={account} />

          <hr />

          <h2>Sign Message</h2>
          <SignMessage account={account} />
        </div>
      )}
    </div>
  );
}

export { useStarknetWallet, TokenBalance, TransferForm, SignMessage };
