import type { HedgeRecipe } from "./types.js";

export function pickHedgeRecipe(params: {
  isStarknetNative: boolean;
  canAssessLiquidity: boolean;
  isIntermittent: boolean;
}): HedgeRecipe {
  if (!params.isStarknetNative) return "hold_base";
  if (!params.canAssessLiquidity) return "hold_base";
  if (params.isIntermittent) return "re7_park";
  return "ekubo_spot_swap";
}

export function hedgeRecipeToString(recipe: HedgeRecipe): string {
  switch (recipe) {
    case "ekubo_spot_swap":
      return "Starknet hedge: neutralize spot exposure by swapping volatile collateral into a stable base on Ekubo before execution. (Signals only, no txs in MVP0.)";
    case "re7_park":
      return "Starknet cash management: park idle collateral in Re7 Ekubo ALMM/yield wrappers while inactive, unwind when signal crosses threshold. (Signals only, no txs in MVP0.)";
    case "hold_base":
      return "Fallback: hold in the venue-required base collateral (usually stablecoin). Skip LP/swap when liquidity/token availability is unclear.";
  }
}
