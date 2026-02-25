export type SupportedRpcSpecVersion = '0.9.0' | '0.10.0';

export function resolveRpcSpecVersion(value: string | undefined): SupportedRpcSpecVersion {
  const normalized = value?.trim();
  if (!normalized || normalized.startsWith('0.9')) {
    return '0.9.0';
  }
  if (normalized.startsWith('0.10')) {
    return '0.10.0';
  }
  throw new Error(
    `Unsupported STARKNET_RPC_SPEC_VERSION: "${normalized}". Expected 0.9.x or 0.10.x`,
  );
}
