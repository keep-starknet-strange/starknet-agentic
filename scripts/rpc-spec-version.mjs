/** @typedef {'0.9.0' | '0.10.0'} SupportedRpcSpecVersion */

/**
 * Normalize a user-provided RPC spec version to a supported Starknet.js value.
 * @param {string | undefined} value
 * @returns {SupportedRpcSpecVersion}
 */
export function resolveRpcSpecVersion(value) {
  const normalized = value?.trim();
  if (!normalized) {
    return '0.9.0';
  }
  if (/^0\.9(?:\.\d+)?$/.test(normalized)) {
    return '0.9.0';
  }
  if (/^0\.10(?:\.\d+)?$/.test(normalized)) {
    return '0.10.0';
  }
  throw new Error(
    `Unsupported STARKNET_RPC_SPEC_VERSION: "${normalized}". Expected 0.9.x or 0.10.x`,
  );
}
