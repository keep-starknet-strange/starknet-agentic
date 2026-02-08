import { NextRequest } from "next/server";
import { agentSpawner, serializeAgent } from "@/lib/agent-spawner";

/**
 * Single Agent endpoint.
 * GET: Agent detail.
 * POST: Control agent (stop/pause/resume).
 * DELETE: Remove agent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = agentSpawner.getAgent(id);

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  return Response.json({ agent: serializeAgent(agent) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const action = body.action as string;

  const agent = agentSpawner.getAgent(id);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  switch (action) {
    case "stop":
      agentSpawner.stop(id);
      break;
    case "pause":
      agentSpawner.pause(id);
      break;
    case "resume":
      agentSpawner.resume(id);
      break;
    default:
      return Response.json(
        { error: "Invalid action. Use 'stop', 'pause', or 'resume'." },
        { status: 400 }
      );
  }

  return Response.json({
    ok: true,
    agent: serializeAgent(agentSpawner.getAgent(id)!),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = agentSpawner.getAgent(id);

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  agentSpawner.remove(id);
  return Response.json({ ok: true, message: `Agent "${agent.name}" removed` });
}
