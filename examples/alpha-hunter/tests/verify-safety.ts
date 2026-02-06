
import { StarknetExecutor } from '../src/starknet/executor';
import { IS_SIMULATION } from '../src/config';

// Mock config to ensure we don't crash on import if env missing
process.env.STARKNET_NODE_URL = "http://localhost:5050";

async function verify() {
    console.log("🧪 Starting Safety Verification...");

    // 1. Verify Simulation Safety
    if (!IS_SIMULATION) {
        console.error("❌ Test must be run with SIMULATION=true env var");
        process.exit(1);
    }

    try {
        console.log("Step 1: Instantiating Executor in Simulation Mode...");
        const executor = new StarknetExecutor();
        console.log("✅ Instantiation successful (no crash).");

        console.log("Step 2: Executing Trade in Simulation Mode...");
        const hash = await executor.executeAlphaBuy("100", "0x123");

        if (hash === "0xSIMULATION_HASH") {
            console.log("✅ Trade simulated successfully. Hash:", hash);
        } else {
            console.error("❌ Unexpected hash in simulation:", hash);
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Crash detected:", e);
        process.exit(1);
    }

    console.log("🎉 Simulation Verification Passed!");

    // 2. Verify Production Safety (Should throw if slippage is 0 / or guard works)
    // We can't easily mock production execution without keys, but we can verify the executor
    // performs the slippage check if we were to call it.
    // For now, let's just confirm the script ran.
}

verify();
