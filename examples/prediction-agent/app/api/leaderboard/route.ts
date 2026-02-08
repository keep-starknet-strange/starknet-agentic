import { NextResponse } from "next/server";
import { getDemoLeaderboard } from "@/lib/market-reader";

export async function GET() {
  try {
    // TODO: Read from on-chain AccuracyTracker when deployed
    const leaderboard = getDemoLeaderboard();

    return NextResponse.json({ leaderboard });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
