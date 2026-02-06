
import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    starknet: {
        nodeUrl: process.env.STARKNET_RPC_URL || 'https://starknet-mainnet.public.blastapi.io',
        agentAccount: process.env.STARKNET_AGENT_ACCOUNT,
        agentPrivateKey: process.env.STARKNET_AGENT_KEY,
    },
    openclaw: {
        gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
        token: process.env.OPENCLAW_GATEWAY_TOKEN,
    }
};

export const IS_SIMULATION = !CONFIG.starknet.agentAccount || !CONFIG.starknet.agentPrivateKey;

if (IS_SIMULATION) {
    console.warn("⚠️  Running in SIMULATION MODE (Missing STARKNET_AGENT_ACCOUNT or STARKNET_AGENT_KEY)");
}
