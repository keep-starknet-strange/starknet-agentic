import { mockFundingProvider } from "./mock-provider.js";
import { starkgateL1FundingProvider } from "./starkgate-l1-provider.js";
import { skippedFundingProvider } from "./skipped-provider.js";
import type { FundingProvider, FundingProviderName } from "./types.js";

export function getFundingProvider(name: FundingProviderName): FundingProvider {
  switch (name) {
    case "mock":
      return mockFundingProvider;
    case "skipped":
      return skippedFundingProvider;
    case "starkgate-l1":
      return starkgateL1FundingProvider;
    default: {
      const unreachable: never = name;
      throw new Error(`Unsupported funding provider: ${String(unreachable)}`);
    }
  }
}
