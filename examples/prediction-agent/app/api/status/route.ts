import { NextResponse } from "next/server";
import { isAgentConfigured, getAgentAddress } from "@/lib/starknet-executor";
import { getAgentIdentity, getDemoAgentIdentities } from "@/lib/agent-identity";

export async function GET() {
  const agentAddress = getAgentAddress();
  const agentId = process.env.AGENT_ID ?? "1";

  // Try to fetch on-chain identity, fall back to demo
  let identity = await getAgentIdentity(agentId);
  if (!identity && agentAddress) {
    const demoIdentities = getDemoAgentIdentities();
    identity = demoIdentities.get(agentAddress) ?? null;
  }

  return NextResponse.json({
    agentConfigured: isAgentConfigured(),
    agentAddress,
    agentId,
    identity,
    contractsDeployed: process.env.MARKET_FACTORY_ADDRESS !== "0x0",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    identityRegistryConfigured: !!process.env.IDENTITY_REGISTRY_ADDRESS,
    reputationRegistryConfigured: !!process.env.REPUTATION_REGISTRY_ADDRESS,
  });
}
