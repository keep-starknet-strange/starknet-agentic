import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Account, RpcProvider, Contract, CallData, cairo } from 'starknet';

async function waitForTransactionWithTimeout(provider, txHash, timeoutMs) {
  let timeout = null;
  try {
    return await Promise.race([
      provider.waitForTransaction(txHash),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`waitForTransaction timed out after ${timeoutMs}ms (${txHash})`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Load .env from script's directory (works regardless of cwd)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const env = {
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  TOKEN_ADDRESS: process.env.TOKEN_ADDRESS,
};

for (const k of Object.keys(env)) {
  if (!env[k]) throw new Error(`Missing env var: ${k}`);
}

// starknet.js v8 uses options objects
const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL });
const account = new Account({
  provider,
  address: env.STARKNET_ACCOUNT_ADDRESS,
  signer: env.STARKNET_PRIVATE_KEY,
});

const TOKEN_ADDRESS = env.TOKEN_ADDRESS;

// Cairo 1 style ABI for ERC20
const ERC20_ABI = [
  {
    type: 'interface',
    name: 'openzeppelin::token::erc20::interface::IERC20',
    items: [
      {
        type: 'function',
        name: 'balance_of',
        inputs: [{ name: 'account', type: 'core::starknet::contract_address::ContractAddress' }],
        outputs: [{ type: 'core::integer::u256' }],
        state_mutability: 'view',
      },
      {
        type: 'function',
        name: 'decimals',
        inputs: [],
        outputs: [{ type: 'core::integer::u8' }],
        state_mutability: 'view',
      },
      {
        type: 'function',
        name: 'transfer',
        inputs: [
          { name: 'recipient', type: 'core::starknet::contract_address::ContractAddress' },
          { name: 'amount', type: 'core::integer::u256' },
        ],
        outputs: [{ type: 'core::bool' }],
        state_mutability: 'external',
      },
    ],
  },
];

function formatAmount(raw, decimals) {
  const s = raw.toString();
  if (decimals === 0) return s;
  const pad = s.padStart(decimals + 1, '0');
  const whole = pad.slice(0, -decimals);
  const frac = pad.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

async function main() {
  console.log('hello-agent demo');
  console.log('address:', account.address);
  console.log('rpc:', env.STARKNET_RPC_URL);

  const token = new Contract({ abi: ERC20_ABI, address: TOKEN_ADDRESS, providerOrAccount: provider });
  const decimals = Number(await token.decimals());
  const balResult = await token.balance_of(account.address);
  // In starknet.js v8 with Cairo 1 ABI, u256 returns as bigint
  const balBn = typeof balResult === 'bigint' ? balResult : BigInt(balResult);
  console.log('token:', TOKEN_ADDRESS);
  console.log('balance:', formatAmount(balBn, decimals));

  // 0-value self-transfer, used only to prove tx path.
  const call = {
    contractAddress: TOKEN_ADDRESS,
    entrypoint: 'transfer',
    calldata: CallData.compile({ recipient: account.address, amount: cairo.uint256(0) }),
  };

  console.log('sending 0-value self-transfer tx...');
  const res = await account.execute(call);
  console.log('tx:', res.transaction_hash);
  await waitForTransactionWithTimeout(provider, res.transaction_hash, 300_000);
  console.log('done');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
