import { NextRequest } from "next/server";
import { forecastMarket, extractProbability } from "@/lib/agent-forecaster";
import {
  AGENT_PERSONAS,
  simulatePersonaForecast,
} from "@/lib/agent-personas";
import { getMarketById, getAgentPredictions, DEMO_QUESTIONS, SUPER_BOWL_REGEX } from "@/lib/market-reader";
import { gatherResearch, buildResearchBrief } from "@/lib/data-sources/index";
import type { DataSourceName } from "@/lib/data-sources/index";
import { runDebateRound, type Round1Result } from "@/lib/agent-debate";

/**
 * Multi-agent forecast endpoint.
 * Runs all agent personas on a market and streams their reasoning.
 * Round 1: Independent forecasts. Round 2: Debate with revisions.
 * Final output: reputation-weighted consensus from Round 2 estimates.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const marketId = body.marketId as number;

  const market = await getMarketById(marketId);

  if (!market) {
    return new Response(JSON.stringify({ error: "Market not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const predictions = await getAgentPredictions(marketId);
  const question = DEMO_QUESTIONS[marketId] ?? `Market #${marketId}`;

  const daysUntil = Math.max(
    0,
    Math.floor((market.resolutionTime - Date.now() / 1000) / 86400)
  );

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentResults: {
          agent: string;
          name: string;
          probability: number;
          brierScore: number;
        }[] = [];

        // ======== ROUND 1: Independent Forecasts ========
        for (const persona of AGENT_PERSONAS) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "agent_start",
                agentId: persona.id,
                agentName: persona.name,
                agentType: persona.agentType,
                model: persona.model,
              })}\n\n`
            )
          );

          let probability: number;

          if (hasApiKey && persona.id === "alpha") {
            // Auto-add ESPN for Super Bowl markets
            const baseSources = (persona.preferredSources ?? ["polymarket", "coingecko", "news", "social"]) as DataSourceName[];
            const sources = SUPER_BOWL_REGEX.test(question) && !baseSources.includes("espn")
              ? [...baseSources, "espn" as DataSourceName]
              : baseSources;

            let researchBrief = "";
            try {
              const research = await gatherResearch(question, sources);
              researchBrief = buildResearchBrief(research);

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "text",
                    agentId: persona.id,
                    content: `[Researched ${research.length} data sources: ${research.map((r) => r.source).join(", ")}]\n\n`,
                  })}\n\n`
                )
              );
            } catch {
              // Research failed, continue without it
            }

            const generator = forecastMarket(question, {
              currentMarketProb: market.impliedProbYes,
              totalPool: (market.totalPool / 10n ** 18n).toString(),
              agentPredictions: predictions.map((p) => ({
                agent: p.agent.slice(0, 10),
                prob: p.predictedProb,
                brier: p.brierScore,
              })),
              timeUntilResolution: `${daysUntil} days`,
              researchBrief,
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
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "text",
                    agentId: persona.id,
                    content: value,
                  })}\n\n`
                )
              );
            }

            probability = result?.probability ?? extractProbability(fullText);
          } else {
            // Simulated forecast for other agents
            const forecast = simulatePersonaForecast(
              persona,
              market.impliedProbYes,
              question
            );
            probability = forecast.probability;

            const chunks = forecast.reasoning.split(/(?<=\n\n)/);
            for (const chunk of chunks) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "text",
                    agentId: persona.id,
                    content: chunk,
                  })}\n\n`
                )
              );
              await new Promise((r) => setTimeout(r, 100));
            }
          }

          const existing = predictions.find(
            (p) => p.agent === `0x${persona.id.charAt(0).toUpperCase()}${persona.id.slice(1)}`
          );
          const brierScore = existing?.brierScore ?? 0.2 + Math.random() * 0.15;

          agentResults.push({
            agent: persona.id,
            name: persona.name,
            probability,
            brierScore,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "agent_complete",
                agentId: persona.id,
                agentName: persona.name,
                probability,
                brierScore,
              })}\n\n`
            )
          );
        }

        // ======== ROUND 2: Agent Debate ========
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "debate_start" })}\n\n`
          )
        );

        const round1Results: Round1Result[] = agentResults.map((a) => ({
          agentId: a.agent,
          agentName: a.name,
          probability: a.probability,
          brierScore: a.brierScore,
        }));

        const debateResults = runDebateRound(round1Results, question);

        for (const debate of debateResults) {
          // Stream debate reasoning
          const chunks = debate.debateReasoning.split(/(?<=\n\n)/);
          for (const chunk of chunks) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "debate_text",
                  agentId: debate.agentId,
                  content: chunk,
                })}\n\n`
              )
            );
            await new Promise((r) => setTimeout(r, 80));
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "debate_complete",
                agentId: debate.agentId,
                agentName: debate.agentName,
                originalProbability: debate.originalProbability,
                revisedProbability: debate.revisedProbability,
              })}\n\n`
            )
          );

          // Update probability to revised estimate
          const idx = agentResults.findIndex((a) => a.agent === debate.agentId);
          if (idx >= 0) {
            agentResults[idx].probability = debate.revisedProbability;
          }
        }

        // ======== CONSENSUS (from Round 2 revised estimates) ========
        const totalInverseWeight = agentResults.reduce(
          (sum, a) => sum + (a.brierScore > 0 ? 1 / a.brierScore : 10),
          0
        );
        const weightedProb = agentResults.reduce(
          (sum, a) =>
            sum +
            a.probability *
              (a.brierScore > 0 ? 1 / a.brierScore : 10),
          0
        ) / totalInverseWeight;

        const simpleAvg =
          agentResults.reduce((sum, a) => sum + a.probability, 0) /
          agentResults.length;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "consensus",
              weightedProbability: weightedProb,
              simpleProbability: simpleAvg,
              agentCount: agentResults.length,
              agents: agentResults.map((a) => ({
                id: a.agent,
                name: a.name,
                probability: a.probability,
                brierScore: a.brierScore,
                weight: a.brierScore > 0 ? (1 / a.brierScore / totalInverseWeight) : 0,
              })),
            })}\n\n`
          )
        );

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
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
