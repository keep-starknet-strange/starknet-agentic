import { NextResponse } from "next/server";
import { getDemoLeaderboard } from "@/lib/market-reader";
import { getDemoAgentIdentities } from "@/lib/agent-identity";
import { agentSpawner } from "@/lib/agent-spawner";

export async function GET() {
  try {
    // TODO: Read from on-chain AccuracyTracker when deployed
    const leaderboard = getDemoLeaderboard();
    const identities = getDemoAgentIdentities();

    const enriched = leaderboard.map((entry) => {
      const identity = identities.get(entry.agent);
      return {
        ...entry,
        identity: identity
          ? {
              name: identity.name,
              agentType: identity.agentType,
              model: identity.model,
              reputationScore: identity.reputationScore,
              feedbackCount: identity.feedbackCount,
            }
          : null,
      };
    });

    // Merge in spawned agents so they appear in the leaderboard
    const spawned = agentSpawner.list();
    let nextRank = enriched.length + 1;
    for (const agent of spawned) {
      enriched.push({
        agent: agent.name,
        avgBrier: 0.5, // No predictions yet
        predictionCount: agent.stats.predictions,
        rank: nextRank++,
        identity: {
          name: agent.name,
          agentType: agent.persona.agentType,
          model: agent.persona.model,
          reputationScore: 0,
          feedbackCount: 0,
        },
      });
    }

    return NextResponse.json({ leaderboard: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
