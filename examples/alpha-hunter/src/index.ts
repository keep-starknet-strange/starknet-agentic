
import { AlphaHunterMCP } from './mcp/client';
import { StarknetExecutor } from './starknet/executor';

import { CONFIG } from './config';

async function main() {
    console.log("🐺 Alpha Hunter (Starknet x Token Terminal) Starting...");

    const mcp = new AlphaHunterMCP();
    const executor = new StarknetExecutor();

    try {


        let signalData: {
            metric: string;
            value: number;
            trend: "neutral" | "up" | "down";
            timestamp: string;
        } = {
            metric: "Starknet DAU",
            value: 0,
            trend: "neutral",
            timestamp: new Date().toLocaleTimeString()
        };

        // 1. WATCH: Query Data
        try {
            const marketData = await mcp.getFinancialData("Get daily active users for Starknet");
            console.log("📈 Market Data:", marketData);

            // Update signal based on real/mock data
            signalData.value = marketData.data[0]; // Assuming latest is first
            signalData.trend = signalData.value > 100000 ? "up" : "down";
        } catch (err) {
            console.log("⚠️ MCP Error (using fallback):", err);
            signalData.metric = "Auth Required / MCP Error";
        }

        // 2. THINK: (Simple rule engine)
        const isBullish = signalData.value > 100000;
        const txLog: any[] = [];

        if (isBullish) {
            console.log("✅ Signal: BULLISH (Active Users > 100k)");

            // 3. ACT: Execute Trade
            try {
                const txHash = await executor.executeAlphaBuy("100000000000000000", "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d");
                console.log(`🚀 Trade Executed: https://voyager.online/tx/${txHash}`);
                txLog.push({ hash: txHash, action: 'Buy 0.1 ETH -> STRK', status: 'success' });
            } catch (e) {
                console.error("Trade failed:", e);
                txLog.push({ hash: 'DOC_FAIL', action: 'Buy Failed', status: 'failed' });
            }
        } else {
            console.log("⏸️ Signal: NEUTRAL. No action taken.");
        }

        // 4. PUBLISH: Write to Frontend
        const fs = await import('fs/promises');
        const path = await import('path');

        const output = {
            lastUpdated: new Date().toISOString(),
            signals: [signalData],
            txs: txLog
        };

        await fs.writeFile(
            path.join(process.cwd(), 'www/public/signals.json'),
            JSON.stringify(output, null, 2)
        );
        console.log("💾 Dashboard updated.");

    } catch (error) {
        console.error("❌ Error running cycle:", error);
    }
}

main();
