import { NextResponse } from "next/server";
import { isAgentConfigured, getAgentAddress } from "@/lib/starknet-executor";

export async function GET() {
  return NextResponse.json({
    agentConfigured: isAgentConfigured(),
    agentAddress: getAgentAddress(),
    contractsDeployed: process.env.MARKET_FACTORY_ADDRESS !== "0x0",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
  });
}
