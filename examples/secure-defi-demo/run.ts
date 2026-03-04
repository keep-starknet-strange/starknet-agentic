#!/usr/bin/env npx tsx
import dotenv from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadRunConfig, parseCliArgs, buildSidecarEnv } from "./src/config.js";
import { McpSidecar } from "./src/mcp.js";
import {
  DemoArtifactSchema,
  buildSummary,
  type DemoArtifact,
  type StepResult,
} from "./src/types.js";

type StepFn = () => Promise<Record<string, unknown> | undefined>;

function nowIso(): string {
  return new Date().toISOString();
}

async function runStep(
  id: string,
  title: string,
  fn: StepFn,
): Promise<StepResult> {
  const startedAt = nowIso();
  try {
    const details = await fn();
    return {
      id,
      title,
      status: "ok",
      startedAt,
      endedAt: nowIso(),
      details,
    };
  } catch (error) {
    return {
      id,
      title,
      status: "failed",
      startedAt,
      endedAt: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function skippedStep(id: string, title: string, reason: string): StepResult {
  const stamp = nowIso();
  return {
    id,
    title,
    status: "skipped",
    startedAt: stamp,
    endedAt: stamp,
    details: { reason },
  };
}

function readBaseAttestation(): DemoArtifact["baseAttestation"] {
  const filePath = process.env.DEMO_BASE_ATTESTATION_PATH?.trim();
  if (!filePath) return undefined;

  const raw = fs.readFileSync(filePath);
  const hash = createHash("sha256").update(raw).digest("hex");
  return {
    path: path.resolve(filePath),
    sha256: hash,
  };
}

function writeArtifact(artifact: DemoArtifact, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `secure-defi-demo-${artifact.runId}.json`;
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return outputPath;
}

function hasTool(tools: string[], name: string): boolean {
  return tools.includes(name);
}

function isVesuUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /contract not found|vtoken not found|entry point not found|contract not deployed/i.test(message);
}

async function main(): Promise<void> {
  dotenv.config();

  const startedAt = nowIso();
  const runId = randomUUID();
  const args = parseCliArgs();
  const config = loadRunConfig(args);
  const sidecar = new McpSidecar(config.mcpEntry, buildSidecarEnv(config));
  const steps: StepResult[] = [];
  const vesuArgs = config.vesuPool
    ? { address: config.accountAddress, tokens: [config.vesuToken], pool: config.vesuPool }
    : { address: config.accountAddress, tokens: [config.vesuToken] };

  steps.push(
    await runStep("startup", "Connect MCP sidecar", async () => {
      await sidecar.connect(config.mode);
      return {
        mode: config.mode,
        signerMode: config.signerMode,
        networkLabel: config.networkLabel,
      };
    }),
  );

  let tools: string[] = [];
  if (steps[steps.length - 1].status === "ok") {
    steps.push(
      await runStep("tool_discovery", "Discover required MCP tools", async () => {
        tools = await sidecar.listTools();

        const required = [
          "starknet_get_balance",
          "starknet_build_transfer_calls",
          "starknet_vesu_positions",
          "starknet_transfer",
        ];

        const missing = required.filter((tool) => !hasTool(tools, tool));
        if (missing.length > 0) {
          throw new Error(`Missing required tools: ${missing.join(", ")}`);
        }

        return {
          required,
          missing,
          discoveredCount: tools.length,
        };
      }),
    );
  }

  const baseAttestation = readBaseAttestation();
  if (baseAttestation) {
    steps.push(
      await runStep("base_attestation", "Load Base reputation attestation", async () => ({
        path: baseAttestation.path,
        sha256: baseAttestation.sha256,
      })),
    );
  } else {
    steps.push(
      skippedStep(
        "base_attestation",
        "Load Base reputation attestation",
        "Set DEMO_BASE_ATTESTATION_PATH to include signed Base reputation context",
      ),
    );
  }

  steps.push(
    await runStep("balance_check", "Read account balance", async () => {
      const balance = await sidecar.callTool("starknet_get_balance", {
        address: config.accountAddress,
        token: config.transferToken,
      });
      return { token: config.transferToken, balance };
    }),
  );

  if (config.agentId) {
    if (!hasTool(tools, "starknet_get_agent_metadata")) {
      steps.push(
        skippedStep(
          "erc8004_identity",
          "Read ERC-8004 agent metadata",
          "Tool starknet_get_agent_metadata not exposed by MCP server",
        ),
      );
    } else {
      steps.push(
        await runStep("erc8004_identity", "Read ERC-8004 agent metadata", async () => {
          const metadata = await sidecar.callTool("starknet_get_agent_metadata", {
            agent_id: config.agentId,
            key: "agentWallet",
          });
          return { agentId: config.agentId, metadata };
        }),
      );
    }
  } else {
    steps.push(
      skippedStep(
        "erc8004_identity",
        "Read ERC-8004 agent metadata",
        "Set DEMO_AGENT_ID to include identity evidence in artifact",
      ),
    );
  }

  if (config.sessionAccountAddress && config.sessionKeyPublicKey && hasTool(tools, "starknet_get_session_data")) {
    steps.push(
      await runStep("session_key_status", "Read session key state", async () => {
        const result = await sidecar.callTool("starknet_get_session_data", {
          account: config.sessionAccountAddress,
          public_key: config.sessionKeyPublicKey,
        });
        return { account: config.sessionAccountAddress, publicKey: config.sessionKeyPublicKey, result };
      }),
    );
  } else {
    steps.push(
      skippedStep(
        "session_key_status",
        "Read session key state",
        "Set DEMO_SESSION_ACCOUNT_ADDRESS and DEMO_SESSION_KEY_PUBLIC_KEY to include session evidence",
      ),
    );
  }

  steps.push(
    await runStep("build_allowed_call", "Build allowed transfer call (unsigned)", async () => {
      const calls = await sidecar.callTool("starknet_build_transfer_calls", {
        recipientAddress: config.accountAddress,
        tokenAddress: config.transferToken,
        amount: config.transferAmount,
      });
      return {
        recipient: config.accountAddress,
        token: config.transferToken,
        amount: config.transferAmount,
        calls,
      };
    }),
  );

  steps.push(
    await runStep("policy_rejection_probe", "Trigger policy rejection preflight", async () => {
      try {
        await sidecar.callTool("starknet_transfer", {
          recipient: config.accountAddress,
          token: config.transferToken,
          amount: config.rejectionProbeAmount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/policy/i.test(message) || /exceeds/i.test(message)) {
          return {
            expectedRejection: true,
            amount: config.rejectionProbeAmount,
            reason: message,
          };
        }
        throw error;
      }

      throw new Error(
        "Rejection probe unexpectedly succeeded. Ensure STARKNET_MCP_POLICY transfer.maxAmountPerCall is below DEMO_REJECTION_PROBE_AMOUNT.",
      );
    }),
  );

  const vesuBefore = await runStep("vesu_positions_before", "Read Vesu position before write", async () => {
    const positions = await sidecar.callTool("starknet_vesu_positions", vesuArgs);
    return { token: config.vesuToken, positions };
  });
  if (vesuBefore.status === "failed" && isVesuUnavailableError(vesuBefore.error)) {
    steps.push(
      skippedStep(
        "vesu_positions_before",
        "Read Vesu position before write",
        `Vesu pool is unavailable for ${config.networkLabel}.`,
      ),
    );
  } else {
    steps.push(vesuBefore);
  }

  if (config.mode === "execute") {
    steps.push(
      await runStep("allowed_transfer_execute", "Execute allowed transfer", async () => {
        const tx = await sidecar.callTool("starknet_transfer", {
          recipient: config.accountAddress,
          token: config.transferToken,
          amount: config.transferAmount,
        });
        return { tx };
      }),
    );

    if (!hasTool(tools, "starknet_vesu_deposit")) {
      steps.push(
        skippedStep(
          "vesu_deposit",
          "Execute Vesu deposit",
          "Tool starknet_vesu_deposit not exposed by MCP server",
        ),
      );
    } else {
      const depositStep = await runStep("vesu_deposit", "Execute Vesu deposit", async () => {
        const tx = await sidecar.callTool("starknet_vesu_deposit", {
          token: config.vesuToken,
          amount: config.vesuDepositAmount,
          ...(config.vesuPool ? { pool: config.vesuPool } : {}),
        });
        return { token: config.vesuToken, amount: config.vesuDepositAmount, tx };
      });
      if (depositStep.status === "failed" && isVesuUnavailableError(depositStep.error)) {
        steps.push(
          skippedStep(
            "vesu_deposit",
            "Execute Vesu deposit",
            `Vesu pool is unavailable for ${config.networkLabel}.`,
          ),
        );
      } else {
        steps.push(depositStep);
      }
    }

    const vesuAfter = await runStep("vesu_positions_after", "Read Vesu position after write", async () => {
      const positions = await sidecar.callTool("starknet_vesu_positions", vesuArgs);
      return { token: config.vesuToken, positions };
    });
    if (vesuAfter.status === "failed" && isVesuUnavailableError(vesuAfter.error)) {
      steps.push(
        skippedStep(
          "vesu_positions_after",
          "Read Vesu position after write",
          `Vesu pool is unavailable for ${config.networkLabel}.`,
        ),
      );
    } else {
      steps.push(vesuAfter);
    }

    if (config.vesuWithdrawAmount) {
      if (!hasTool(tools, "starknet_vesu_withdraw")) {
        steps.push(
          skippedStep(
            "vesu_withdraw",
            "Execute Vesu withdraw",
            "Tool starknet_vesu_withdraw not exposed by MCP server",
          ),
        );
      } else {
        const withdrawStep = await runStep("vesu_withdraw", "Execute Vesu withdraw", async () => {
          const tx = await sidecar.callTool("starknet_vesu_withdraw", {
            token: config.vesuToken,
            amount: config.vesuWithdrawAmount,
            ...(config.vesuPool ? { pool: config.vesuPool } : {}),
          });
          return { token: config.vesuToken, amount: config.vesuWithdrawAmount, tx };
        });
        if (withdrawStep.status === "failed" && isVesuUnavailableError(withdrawStep.error)) {
          steps.push(
            skippedStep(
              "vesu_withdraw",
              "Execute Vesu withdraw",
              `Vesu pool is unavailable for ${config.networkLabel}.`,
            ),
          );
        } else {
          steps.push(withdrawStep);
        }
      }
    }
  } else {
    steps.push(skippedStep("allowed_transfer_execute", "Execute allowed transfer", "Run with --mode execute"));
    steps.push(skippedStep("vesu_deposit", "Execute Vesu deposit", "Run with --mode execute"));
    steps.push(skippedStep("vesu_positions_after", "Read Vesu position after write", "Run with --mode execute"));
    steps.push(skippedStep("vesu_withdraw", "Execute Vesu withdraw", "Run with --mode execute --with-withdraw"));
  }

  await sidecar.close();

  const summary = buildSummary(steps);
  const recommendations: string[] = [];

  if (config.mode === "dry-run") {
    recommendations.push("Dry-run completed. Next step: run --mode execute with funded test account.");
  }

  if (summary.failed > 0) {
    recommendations.push("Inspect failed steps in artifact and resolve env/tooling prerequisites before rerunning.");
  }

  if (!baseAttestation) {
    recommendations.push("Provide DEMO_BASE_ATTESTATION_PATH to include Base reputation evidence in artifact.");
  }

  if (
    steps.some(
      (step) =>
        step.id.startsWith("vesu_") &&
        step.status === "skipped" &&
        String(step.details?.reason || "").toLowerCase().includes("unavailable"),
    )
  ) {
    recommendations.push(
      "Vesu appears unavailable on this network label. Use Starknet mainnet (or a network with deployed Vesu pool contracts) for full DeFi proof.",
    );
  }

  const artifact: DemoArtifact = DemoArtifactSchema.parse({
    runId,
    issue: "https://github.com/keep-starknet-strange/starknet-agentic/issues/311",
    mode: config.mode,
    networkLabel: config.networkLabel,
    startedAt,
    endedAt: nowIso(),
    accountAddress: config.accountAddress,
    signerMode: config.signerMode,
    baseAttestation,
    steps,
    summary,
    recommendations,
  });

  const artifactPath = writeArtifact(artifact, config.outputDir);

  process.stdout.write(`${JSON.stringify({ artifactPath, summary, recommendations }, null, 2)}\n`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`secure-defi-demo failed: ${message}\n`);
  process.exitCode = 1;
});
