/**
 * Placeholder example for Privy signer diagnostics in Starkzap.
 */

import { OnboardStrategy, StarkSDK } from "starkzap";

async function main() {
  const sdk = new StarkSDK({ network: "sepolia" });

  await sdk.onboard({
    strategy: OnboardStrategy.Privy,
    privy: {
      resolve: async () => ({
        walletId: process.env.PRIVY_WALLET_ID!,
        publicKey: process.env.PRIVY_PUBLIC_KEY!,
        serverUrl: process.env.PRIVY_SIGNER_URL!,
      }),
    },
    feeMode: "sponsored",
  });

  console.log("Privy onboarding placeholder completed");
}

main().catch((error) => {
  console.error("privy-signing-debug failed:", error);
  process.exit(1);
});

