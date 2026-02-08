import { NextRequest, NextResponse } from "next/server";
import {
  getMarketById,
  getAgentPredictions,
  getWeightedProbability,
  DEMO_QUESTIONS,
} from "@/lib/market-reader";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const marketId = parseInt(id, 10);
    const market = await getMarketById(marketId);

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const [predictions, weightedProb] = await Promise.all([
      getAgentPredictions(marketId),
      getWeightedProbability(marketId),
    ]);

    return NextResponse.json({
      market: {
        ...market,
        question: DEMO_QUESTIONS[marketId] ?? `Market #${marketId}`,
        totalPool: market.totalPool.toString(),
        yesPool: market.yesPool.toString(),
        noPool: market.noPool.toString(),
      },
      predictions,
      weightedProbability: weightedProb,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
