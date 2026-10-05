export const DEFAULT_STARKNET_RPC_URL = 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10';

export function resolveRpcUrl() {
  return process.env.STARKNET_RPC_URL || DEFAULT_STARKNET_RPC_URL;
}
