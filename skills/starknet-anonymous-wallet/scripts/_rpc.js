export const DEFAULT_STARKNET_RPC_URL = 'https://rpc.starknet.lava.build:443';

export function resolveRpcUrl() {
  return process.env.STARKNET_RPC_URL || DEFAULT_STARKNET_RPC_URL;
}
