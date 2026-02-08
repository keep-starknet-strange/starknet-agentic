import { NextResponse } from "next/server";
import { getDemoLeaderboard } from "@/lib/market-reader";
import { getDemoAgentIdentities } from "@/lib/agent-identity";

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

    return NextResponse.json({ leaderboard: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
