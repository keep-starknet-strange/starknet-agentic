/**
 * Placeholder example script for Starkzap wallet execution.
 * Fill in env values and adapt in the Starkzap repository context.
 */

import { ChainId, StarkSDK, StarkSigner } from "starkzap";

async function main() {
  const sdk = new StarkSDK({
    rpcUrl: process.env.RPC_URL!,
    chainId: ChainId.SEPOLIA,
  });

  const wallet = await sdk.connectWallet({
    account: { signer: new StarkSigner(process.env.PRIVATE_KEY!) },
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

