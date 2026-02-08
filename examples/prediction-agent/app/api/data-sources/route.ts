import { NextRequest } from "next/server";
import { quickResearch } from "@/lib/research-agent";
import type { DataSourceName } from "@/lib/data-sources/index";

/**
 * Data Sources endpoint.
 * GET ?question=...&sources=polymarket,coingecko
 * Returns aggregated data from all requested sources.
 */
export async function GET(request: NextRequest) {
  const question = request.nextUrl.searchParams.get("question");
  if (!question) {
    return Response.json(
      { error: "Missing 'question' query parameter" },
      { status: 400 }
    );
  }

  const sourcesParam = request.nextUrl.searchParams.get("sources");
  const sources = sourcesParam
    ? (sourcesParam.split(",") as DataSourceName[])
    : undefined;

  const results = await quickResearch(question, sources);

  return Response.json({
    question,
    timestamp: Date.now(),
    sourceCount: results.length,
    results,
  });
}
