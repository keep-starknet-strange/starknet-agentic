import { NextRequest, NextResponse } from "next/server";
import { generateAgentCard } from "@/lib/agent-identity";

export async function GET(request: NextRequest) {
  try {
    const agentId = process.env.AGENT_ID ?? "1";
    const baseUrl =
      request.headers.get("x-forwarded-host")
        ? `https://${request.headers.get("x-forwarded-host")}`
        : `http://localhost:${process.env.PORT ?? 3000}`;

    const card = await generateAgentCard(agentId, baseUrl);

    return NextResponse.json(card, {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
