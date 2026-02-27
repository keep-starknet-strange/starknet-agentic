/**
 * Placeholder example script for Starkzap wallet execution.
 * Fill in env values and adapt in the Starkzap repository context.
 */

import { ChainId, StarkSDK, StarkSigner } from "starkzap";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv("RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");

  const sdk = new StarkSDK({
    rpcUrl,
    chainId: ChainId.SEPOLIA,
  });

  const wallet = await sdk.connectWallet({
    account: { signer: new StarkSigner(privateKey) },
    feeMode: "user_pays",
  });

  await wallet.ensureReady({ deploy: "if_needed" });

  // Replace with real calldata in Starkzap repo usage.
  console.log("Wallet is ready:", wallet.address);
}

main().catch((error) => {
  console.error("wallet-execute-example failed:", error);
  process.exit(1);
});
