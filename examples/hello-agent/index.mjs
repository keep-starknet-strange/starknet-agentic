import 'dotenv/config';
import { Account, RpcProvider, Contract, CallData, cairo, uint256 } from 'starknet';

const env = {
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
};

for (const k of Object.keys(env)) {
  if (!env[k]) throw new Error(`Missing env var: ${k}`);
}

const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL });
const account = new Account({ provider, address: env.STARKNET_ACCOUNT_ADDRESS, signer: env.STARKNET_PRIVATE_KEY });

// STRK (mainnet address). For Sepolia, STRK may differ; but 0-value transfer is used only as a tx exercise.
// If STRK is not deployed on your network, set TOKEN_ADDRESS explicitly.
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'felt' }],
    outputs: [{ name: 'balance', type: 'Uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: 'decimals', type: 'felt' }],
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
  const bal = await token.balanceOf(account.address);
  const balBn = uint256.uint256ToBN(bal);
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
  await provider.waitForTransaction(res.transaction_hash);
  console.log('done');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
