import { NextResponse } from "next/server";
import { getMarkets, DEMO_QUESTIONS } from "@/lib/market-reader";

export async function GET() {
  try {
    const markets = await getMarkets();

    const enriched = markets.map((m) => ({
      ...m,
      question: DEMO_QUESTIONS[m.id] ?? `Market #${m.id}`,
      totalPool: m.totalPool.toString(),
      yesPool: m.yesPool.toString(),
      noPool: m.noPool.toString(),
    }));

    return NextResponse.json({ markets: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
