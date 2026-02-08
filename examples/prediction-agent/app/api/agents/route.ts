import { NextRequest } from "next/server";
import {
  agentSpawner,
  serializeAgent,
  type SpawnAgentConfig,
} from "@/lib/agent-spawner";

/**
 * Spawned Agents endpoint.
 * GET: List all spawned agents with stats.
 * POST: Spawn a new custom agent.
 */
export async function GET() {
  const agents = agentSpawner.list().map(serializeAgent);
  return Response.json({ agents, count: agents.length });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const config: SpawnAgentConfig = {
    name: body.name ?? `Agent-${Date.now().toString(36)}`,
    personaId: body.personaId,
    customSystemPrompt: body.systemPrompt,
    budgetStrk: body.budgetStrk ?? 1000,
    maxBetStrk: body.maxBetStrk ?? 100,
    preferredSources: body.preferredSources,
  };

  if (!config.name || config.name.length < 2) {
    return Response.json(
      { error: "Agent name must be at least 2 characters" },
      { status: 400 }
    );
  }

  const agent = agentSpawner.spawn(config);

  return Response.json({
    ok: true,
    message: `Agent "${agent.name}" spawned`,
    agent: serializeAgent(agent),
  });
}
