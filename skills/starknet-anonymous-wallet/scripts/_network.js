import { constants } from 'starknet';

const { SN_MAIN, SN_SEPOLIA } = constants.StarknetChainId;

// Chain ID -> AVNU endpoints. This table is the allowlist: no other AVNU API or
// paymaster host is called, and a chain ID missing here gets no endpoints.
export const NETWORKS = Object.freeze({
  [SN_MAIN]: Object.freeze({
    name: 'SN_MAIN',
    chainId: SN_MAIN,
    avnuApiHost: 'starknet.api.avnu.fi',
    paymasterHost: 'starknet.paymaster.avnu.fi',
    explorerTxUrl: 'https://starkscan.co/tx/'
  }),
  [SN_SEPOLIA]: Object.freeze({
    name: 'SN_SEPOLIA',
    chainId: SN_SEPOLIA,
    avnuApiHost: 'sepolia.api.avnu.fi',
    paymasterHost: 'sepolia.paymaster.avnu.fi',
    explorerTxUrl: 'https://sepolia.starkscan.co/tx/'
  })
});

export function networkForChainId(chainId) {
  let key;
  try {
    key = `0x${BigInt(chainId).toString(16)}`;
  } catch {
    key = undefined;
  }
  if (!key || !Object.hasOwn(NETWORKS, key)) {
    throw new Error(`Unsupported Starknet chain ID ${chainId}: AVNU is only configured for SN_MAIN (${SN_MAIN}) and SN_SEPOLIA (${SN_SEPOLIA})`);
  }
  return NETWORKS[key];
}

/**
 * Network of the RPC behind `provider`. Throws for any chain ID outside NETWORKS.
 */
export async function getNetwork(provider) {
  return networkForChainId(await provider.getChainId());
}

/**
 * Throws unless `network` is an entry of NETWORKS, so a missing or forged
 * network never falls back to the SDK's mainnet default.
 */
export function assertNetwork(network) {
  if (!network || !Object.hasOwn(NETWORKS, network.chainId) || NETWORKS[network.chainId] !== network) {
    throw new Error('Missing or unsupported network; resolve it from the RPC with getNetwork(provider)');
  }
  return network;
}

/**
 * avnu-sdk options (`{ baseUrl }`) for `network`.
 */
export function avnuOptions(network) {
  return { baseUrl: `https://${assertNetwork(network).avnuApiHost}` };
}
