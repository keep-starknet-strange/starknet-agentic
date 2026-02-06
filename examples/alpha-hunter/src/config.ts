
import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    starknet: {
        nodeUrl: process.env.STARKNET_NODE_URL || 'https://starknet-mainnet.public.blastapi.io',
        agentAccount: process.env.STARKNET_AGENT_ACCOUNT,
        agentPrivateKey: process.env.STARKNET_AGENT_KEY,
    },
    openclaw: {
        gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
        token: process.env.OPENCLAW_GATEWAY_TOKEN,
    }
};

// Explicitly check for boolean string 'true' from env, or fallback to key presence check
export const IS_SIMULATION = process.env.SIMULATION === 'true' || process.env.IS_SIMULATION === 'true' || (!CONFIG.starknet.agentAccount || !CONFIG.starknet.agentPrivateKey);

if (IS_SIMULATION) {
    console.warn("⚠️  Running in SIMULATION MODE");
}
