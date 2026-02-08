import { NextRequest } from "next/server";
import { forecastMarket, extractProbability } from "@/lib/agent-forecaster";
import { getMarketById, getAgentPredictions, DEMO_QUESTIONS } from "@/lib/market-reader";
import { recordPrediction } from "@/lib/starknet-executor";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const marketId = body.marketId as number;

  // Return the stream immediately, do all work inside
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Fetch market data inside the stream to avoid pre-stream timeout
        const market = await getMarketById(marketId);

        if (!market) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Market not found" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const predictions = await getAgentPredictions(marketId);
        const question = DEMO_QUESTIONS[marketId] ?? `Market #${marketId}`;

        const daysUntil = Math.max(
          0,
          Math.floor((market.resolutionTime - Date.now() / 1000) / 86400)
        );

        const generator = forecastMarket(question, {
          currentMarketProb: market.impliedProbYes,
          totalPool: (market.totalPool / 10n ** 18n).toString(),
          agentPredictions: predictions.map((p) => ({
            agent: p.agent.slice(0, 10),
            prob: p.predictedProb,
            brier: p.brierScore,
          })),
          timeUntilResolution: `${daysUntil} days`,
        });

        let fullText = "";
        let result: any;

        while (true) {
          const { value, done } = await generator.next();
          if (done) {
            result = value;
            break;
          }
          fullText += value;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", content: value })}\n\n`)
          );
        }

        const probability = result?.probability ?? extractProbability(fullText);

        // Attempt to record prediction on-chain
        const txResult = await recordPrediction(marketId, probability);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "result",
              probability,
              txHash: txResult.txHash,
              txStatus: txResult.status,
              txError: txResult.error,
            })}\n\n`
          )
        );

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: any) {
        const msg = err.message || String(err);
        console.error("[predict] Error:", msg, err.stack);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: msg })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
