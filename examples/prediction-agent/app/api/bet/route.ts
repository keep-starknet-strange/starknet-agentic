import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { placeBet } from "@/lib/starknet-executor";
import { getMarketById } from "@/lib/market-reader";

export const maxDuration = 30;

const BetSchema = z.object({
  marketId: z.number().int().min(0),
  outcome: z.union([z.literal(0), z.literal(1)]),
  amount: z.string(), // bigint as string
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BetSchema.parse(body);

    const market = await getMarketById(parsed.marketId);

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    if (market.status !== 0) {
      return NextResponse.json({ error: "Market is not open" }, { status: 400 });
    }

    const result = await placeBet(
      market.address,
      parsed.outcome as 0 | 1,
      BigInt(parsed.amount),
      market.collateralToken
    );

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
