
import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    starknet: {
        nodeUrl: process.env.STARKNET_RPC_URL || 'https://starknet-mainnet.public.blastapi.io',
        agentAccount: process.env.STARKNET_AGENT_ACCOUNT || '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        agentPrivateKey: process.env.STARKNET_AGENT_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001',
    },
    openclaw: {
        gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
        token: process.env.OPENCLAW_GATEWAY_TOKEN,
    }
};
