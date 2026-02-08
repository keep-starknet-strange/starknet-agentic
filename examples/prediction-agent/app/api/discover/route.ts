import { NextRequest } from "next/server";
import { discoverMarkets, getCategories } from "@/lib/market-discovery";

/**
 * Market Discovery endpoint.
 * GET: Returns suggested markets from the discovery engine.
 * Optional query params: ?category=crypto&limit=5
 */
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const limitStr = request.nextUrl.searchParams.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  const markets = await discoverMarkets(category, limit);

  return Response.json({
    markets,
    count: markets.length,
    categories: getCategories(),
    timestamp: Date.now(),
  });
}
