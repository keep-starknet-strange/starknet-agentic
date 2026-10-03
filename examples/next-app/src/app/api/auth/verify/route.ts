import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  // In a real Next.js app, delegate to the SISNA verify handler
  return NextResponse.json({ message: "SISNA verify endpoint", body });
}
