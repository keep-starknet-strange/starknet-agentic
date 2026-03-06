#!/usr/bin/env -S npx tsx
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createSignedEvidenceManifest,
  resolvePrivateKeyPem,
  verifyEvidenceManifestFile,
} from "../../scripts/security/evidence-manifest.mjs";

import { loadAndVerifyBaseAttestation } from "./src/attestation.js";
import { loadRunConfig, parseCliArgs, buildSidecarEnv } from "./src/config.js";
import { McpSidecar } from "./src/mcp.js";
import {
  DemoArtifactSchema,
  SessionStateSchema,
  buildSummary,
  type DemoArtifact,
  type SecurityClaim,
  type SessionState,
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

function writeArtifact(artifact: DemoArtifact, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `secure-defi-demo-${artifact.runId}.json`;
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return outputPath;
}

function copyEvidenceAttachment(sourcePath: string, outputDir: string, runId: string, label: string): string {
  const absoluteSource = path.resolve(sourcePath);
  if (!fs.existsSync(absoluteSource)) {
    throw new Error(`Evidence attachment not found: ${absoluteSource}`);
  }

  const extension = path.extname(absoluteSource) || ".json";
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const targetDir = path.join(outputDir, "evidence");
  const targetPath = path.join(targetDir, `${safeLabel}-${runId}${extension}`);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(absoluteSource, targetPath);
  return targetPath;
}

function hasTool(tools: string[], name: string): boolean {
  return tools.includes(name);
}

function isVesuUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /contract not found|vtoken not found|entry point not found|contract not deployed/i.test(message);
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /request.*timed out|transaction.*timeout|rpc.*timeout/i.test(message);
}

function isPolicyRejectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /policy violation|blocked by policy|not covered by policy|exceeds policy|is not in the allowed|denied by policy|spending:.*exceeds|spending.*denied/i.test(
    message,
  );
}

function isSessionRejectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /session.*(expired|revoke|not active|invalid|max calls|unauthorized)|invalid signature/i.test(message);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelayMs = 500,
  multiplier = 2,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delayMs = Math.round(initialDelayMs * Math.pow(multiplier, attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

function parseSessionData(result: unknown): SessionState {
  return SessionStateSchema.parse(result);
}

function normalizeHexAddress(value: string): string {
  return `0x${BigInt(value).toString(16)}`;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function extractTxHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/0x[0-9a-fA-F]+/);
  return match?.[0] ?? null;
}

function findStep(steps: StepResult[], id: string): StepResult | undefined {
  return steps.find((step) => step.id === id);
}

function buildClaims(steps: StepResult[], artifactPath: string, strict: boolean, starkzapEnabled: boolean): SecurityClaim[] {
  const claims: SecurityClaim[] = [];

  const policyStep = findStep(steps, "policy_rejection_probe");
  const policyExpected = policyStep?.status === "ok" && policyStep.details?.expectedRejection === true;
  const policyOnchainRevert = policyExpected && policyStep.details?.onchainRevert === true;
  const policyTxHash =
    asNonEmptyString(policyStep?.details?.txHash) ?? extractTxHash(asNonEmptyString(policyStep?.details?.reason));
  claims.push({
    claimId: "oversized_spend_denied",
    required: strict,
    proof_status:
      strict ? (policyOnchainRevert && policyTxHash ? "proved" : "missing") : policyExpected ? "proved" : "missing",
    tx_hash: policyTxHash,
    evidence_path: "steps.policy_rejection_probe",
    note: strict
      ? "Strict mode requires on-chain REVERTED evidence with transaction hash."
      : "Preflight policy rejection evidence.",
  });

  const selectorStep = findStep(steps, "forbidden_selector_probe");
  const selectorProved = selectorStep?.status === "ok" && selectorStep.details?.expectedRejection === true;
  claims.push({
    claimId: "forbidden_selector_denied",
    required: strict,
    proof_status: selectorProved ? "proved" : "missing",
    tx_hash: extractTxHash(asNonEmptyString(selectorStep?.details?.reason)),
    evidence_path: "steps.forbidden_selector_probe",
  });

  const sessionStep = findStep(steps, "expired_session_probe");
  const sessionProved = sessionStep?.status === "ok" && sessionStep.details?.expectedRejection === true;
  claims.push({
    claimId: "revoked_or_expired_session_blocked",
    required: strict,
    proof_status: sessionProved ? "proved" : "missing",
    tx_hash: extractTxHash(asNonEmptyString(sessionStep?.details?.reason)),
    evidence_path: "steps.expired_session_probe",
    note: "Requires proxy signer path with inactive/revoked session evidence.",
  });

  const identityStep = findStep(steps, "erc8004_identity");
  const identityProved = identityStep?.status === "ok";
  claims.push({
    claimId: "erc8004_identity_path",
    required: strict,
    proof_status: identityProved ? "proved" : "missing",
    tx_hash: null,
    evidence_path: "steps.erc8004_identity",
  });

  const anchorStep = findStep(steps, "base_attestation_anchor");
  const anchorTx = asNonEmptyString(anchorStep?.details?.transactionHash) ?? null;
  const anchorProved =
    anchorStep?.status === "ok" &&
    anchorTx !== null &&
    asNonEmptyString(anchorStep.details?.readBack) === asNonEmptyString(anchorStep.details?.value);
  claims.push({
    claimId: "base_to_starknet_anchor_verified",
    required: strict,
    proof_status: anchorProved ? "proved" : "missing",
    tx_hash: anchorTx,
    evidence_path: "steps.base_attestation_anchor",
  });

  const starkzapStep = findStep(steps, "starkzap_receipt");
  const starkzapTx = asNonEmptyString(starkzapStep?.details?.transactionHash) ?? null;
  const starkzapProved = starkzapStep?.status === "ok" && starkzapTx !== null;
  claims.push({
    claimId: "starkzap_execution_receipt",
    required: strict && starkzapEnabled,
    proof_status: starkzapEnabled ? (starkzapProved ? "proved" : "missing") : "not_applicable",
    tx_hash: starkzapTx,
    evidence_path: starkzapEnabled
      ? asNonEmptyString(starkzapStep?.details?.evidencePath) ?? "steps.starkzap_receipt"
      : artifactPath,
    note: starkzapEnabled ? undefined : "Set DEMO_ENABLE_STARKZAP_PROOF=1 to require this claim.",
  });

  return claims;
}

async function fetchReceipt(rpcUrl: string, txHash: string): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "starknet_getTransactionReceipt",
      params: [txHash],
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC receipt request failed (${response.status})`);
  }
  const payload = (await response.json()) as { error?: { message?: string }; result?: unknown };
  if (payload.error) {
    throw new Error(payload.error.message || "RPC receipt returned an error");
  }
  return payload.result;
}

function parseRegisteredAgentIdFromReceipt(
  receipt: unknown,
  identityRegistryAddress: string,
): string | null {
  const events = (receipt as { events?: Array<{ from_address?: string; keys?: string[] }> })?.events;
  if (!Array.isArray(events)) return null;

  const expectedFrom = normalizeHexAddress(identityRegistryAddress);
  const maxUint128 = (1n << 128n) - 1n;
  for (const event of events) {
    if (!event?.from_address || !Array.isArray(event.keys) || event.keys.length < 3) continue;
    let from: string;
    try {
      from = normalizeHexAddress(event.from_address);
    } catch {
      continue;
    }
    if (from !== expectedFrom) continue;

    try {
      const low = BigInt(event.keys[1]);
      const high = BigInt(event.keys[2]);
      if (low < 0n || high < 0n || low > maxUint128 || high > maxUint128) {
        continue;
      }
      return (low + (high << 128n)).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function renderMarkdownSummary(artifact: DemoArtifact): string {
  const lines: string[] = [
    "# Secure DeFi Demo Result",
    "",
    `- Run ID: \`${artifact.runId}\``,
    `- Mode: \`${artifact.mode}\``,
    `- Strict security proof: \`${artifact.strictSecurityProof}\``,
    `- Network: \`${artifact.networkLabel}\``,
    `- Account: \`${artifact.accountAddress}\``,
    `- Signer mode: \`${artifact.signerMode}\``,
    `- Started: ${artifact.startedAt}`,
    `- Ended: ${artifact.endedAt}`,
    "",
    "## Summary",
    "",
    `- Total: ${artifact.summary.totalSteps}`,
    `- OK: ${artifact.summary.ok}`,
    `- Failed: ${artifact.summary.failed}`,
    `- Skipped: ${artifact.summary.skipped}`,
    "",
    "## Steps",
    "",
    "| Step | Status | Notes |",
    "| --- | --- | --- |",
  ];

  for (const step of artifact.steps) {
    const notes = step.error ?? (step.details ? JSON.stringify(step.details) : "");
    lines.push(`| ${step.id} | ${step.status} | ${notes.replaceAll("|", "\\|")} |`);
  }

  if (artifact.claims.length > 0) {
    lines.push("", "## Claims", "", "| Claim | Required | Status | Tx Hash | Evidence |", "| --- | --- | --- | --- | --- |");
    for (const claim of artifact.claims) {
      lines.push(
        `| ${claim.claimId} | ${claim.required} | ${claim.proof_status} | ${claim.tx_hash ?? ""} | ${claim.evidence_path.replaceAll("|", "\\|")} |`,
      );
    }
  }

  if (artifact.recommendations.length > 0) {
    lines.push("", "## Recommendations", "");
    for (const recommendation of artifact.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeMarkdownSummary(artifact: DemoArtifact, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `secure-defi-demo-${artifact.runId}.md`;
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, renderMarkdownSummary(artifact), "utf8");
  return outputPath;
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

  try {
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

  const baseAttestationPath = process.env.DEMO_BASE_ATTESTATION_PATH?.trim();
  let baseAttestation: DemoArtifact["baseAttestation"];
  if (baseAttestationPath) {
    steps.push(
      await runStep(
        "base_attestation",
        "Load and verify Base reputation attestation",
        async () => {
          const verified = loadAndVerifyBaseAttestation(baseAttestationPath);
          baseAttestation = verified;
          return verified;
        },
      ),
    );
  } else {
    steps.push(
      skippedStep(
        "base_attestation",
        "Load and verify Base reputation attestation",
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

  let resolvedAgentId = config.agentId;
  if (!resolvedAgentId && config.autoRegisterAgent) {
    if (!hasTool(tools, "starknet_register_agent")) {
      steps.push(
        skippedStep(
          "erc8004_register_agent",
          "Register ERC-8004 agent identity",
          "Tool starknet_register_agent not exposed by MCP server",
        ),
      );
    } else {
      steps.push(
        await runStep("erc8004_register_agent", "Register ERC-8004 agent identity", async () => {
          const registration = (await sidecar.callTool("starknet_register_agent", {
            ...(config.agentTokenUri ? { token_uri: config.agentTokenUri } : {}),
          })) as Record<string, unknown>;

          let agentId = asNonEmptyString(registration.agentId);
          const transactionHash = asNonEmptyString(registration.transactionHash);

          if (!agentId && transactionHash && config.identityRegistryAddress) {
            const receipt = await fetchReceipt(config.rpcUrl, transactionHash);
            agentId = parseRegisteredAgentIdFromReceipt(receipt, config.identityRegistryAddress) ?? undefined;
          }

          if (!agentId) {
            throw new Error(
              "ERC-8004 registration completed but agentId could not be resolved. Set DEMO_AGENT_ID explicitly.",
            );
          }

          resolvedAgentId = agentId;
          return {
            agentId,
            transactionHash: transactionHash ?? null,
            tokenUri: config.agentTokenUri ?? null,
          };
        }),
      );
    }
  }

  if (resolvedAgentId) {
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
            agent_id: resolvedAgentId,
            key: "agentWallet",
          });
          return { agentId: resolvedAgentId, metadata };
        }),
      );
    }
  } else {
    steps.push(
      skippedStep(
        "erc8004_identity",
        "Read ERC-8004 agent metadata",
        "Set DEMO_AGENT_ID or DEMO_AUTO_REGISTER_AGENT=1 to include identity evidence in artifact",
      ),
    );
  }

  if (config.anchorBaseToErc8004) {
    if (!baseAttestation) {
      steps.push(
        skippedStep(
          "base_attestation_anchor",
          "Anchor Base attestation hash on ERC-8004 metadata",
          "DEMO_BASE_ATTESTATION_PATH is required when DEMO_ANCHOR_BASE_TO_ERC8004=1",
        ),
      );
    } else if (!resolvedAgentId) {
      steps.push(
        skippedStep(
          "base_attestation_anchor",
          "Anchor Base attestation hash on ERC-8004 metadata",
          "Missing agent id. Set DEMO_AGENT_ID or DEMO_AUTO_REGISTER_AGENT=1",
        ),
      );
    } else if (!hasTool(tools, "starknet_set_agent_metadata") || !hasTool(tools, "starknet_get_agent_metadata")) {
      steps.push(
        skippedStep(
          "base_attestation_anchor",
          "Anchor Base attestation hash on ERC-8004 metadata",
          "Required metadata tools are not exposed by MCP server",
        ),
      );
    } else {
      const anchoredBaseAttestation = baseAttestation;
      if (!anchoredBaseAttestation) {
        throw new Error("Missing base attestation for anchor step.");
      }
      steps.push(
        await runStep("base_attestation_anchor", "Anchor Base attestation hash on ERC-8004 metadata", async () => {
          const key = config.baseAnchorMetadataKey;
          const value = anchoredBaseAttestation.sha256;

          const setResult = (await sidecar.callTool("starknet_set_agent_metadata", {
            agent_id: resolvedAgentId,
            key,
            value,
          })) as Record<string, unknown>;
          const getResult = (await sidecar.callTool("starknet_get_agent_metadata", {
            agent_id: resolvedAgentId,
            key,
          })) as Record<string, unknown>;

          const readBack = asNonEmptyString(getResult.value) ?? "";
          if (readBack !== value) {
            throw new Error(`Anchored value mismatch for key ${key}: expected ${value}, got ${readBack || "<empty>"}`);
          }

          return {
            agentId: resolvedAgentId,
            key,
            value,
            transactionHash: asNonEmptyString(setResult.transactionHash) ?? null,
            readBack,
          };
        }),
      );
    }
  }

  let sessionState: SessionState | undefined;
  if (config.sessionAccountAddress && config.sessionKeyPublicKey && hasTool(tools, "starknet_get_session_data")) {
    steps.push(
      await runStep("session_key_status", "Read session key state", async () => {
        const result = await sidecar.callTool("starknet_get_session_data", {
          accountAddress: config.sessionAccountAddress,
          sessionPublicKey: config.sessionKeyPublicKey,
        });
        const parsed = parseSessionData(result);
        sessionState = parsed;
        return parsed;
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

  if (hasTool(tools, "starknet_build_calls")) {
    steps.push(
      await runStep("forbidden_selector_probe", "Trigger forbidden selector rejection", async () => {
        try {
          await sidecar.callTool("starknet_build_calls", {
            calls: [
              {
                contractAddress: config.accountAddress,
                entrypoint: "upgrade",
                calldata: [],
              },
            ],
          });
        } catch (error) {
          if (isPolicyRejectionError(error)) {
            return {
              expectedRejection: true,
              entrypoint: "upgrade",
              reason: error instanceof Error ? error.message : String(error),
            };
          }
          throw error;
        }

        throw new Error('Forbidden selector probe unexpectedly succeeded for entrypoint "upgrade".');
      }),
    );
  } else {
    steps.push(
      skippedStep(
        "forbidden_selector_probe",
        "Trigger forbidden selector rejection",
        "Tool starknet_build_calls not exposed by MCP server",
      ),
    );
  }

  steps.push(
    await runStep("policy_rejection_probe", "Trigger policy rejection preflight", async () => {
      try {
        await sidecar.callTool("starknet_transfer", {
          recipient: config.accountAddress,
          token: config.transferToken,
          amount: config.rejectionProbeAmount,
          dryRun: config.mode === "dry-run",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isPolicyRejectionError(error)) {
          const txHash = extractTxHash(message);
          const onchainRevert = /status\s*=\s*REVERTED/i.test(message) && txHash !== null;
          return {
            expectedRejection: true,
            amount: config.rejectionProbeAmount,
            reason: message,
            txHash,
            onchainRevert,
          };
        }
        throw error;
      }

      throw new Error(
        "Rejection probe unexpectedly succeeded. Ensure STARKNET_MCP_POLICY transfer.maxAmountPerCall is below DEMO_REJECTION_PROBE_AMOUNT.",
      );
    }),
  );

  if (config.mode === "execute" && config.signerMode === "proxy") {
    if (!sessionState) {
      steps.push(
        skippedStep(
          "expired_session_probe",
          "Attempt transfer with inactive session",
          "No session state evidence available. Set DEMO_SESSION_ACCOUNT_ADDRESS and DEMO_SESSION_KEY_PUBLIC_KEY.",
        ),
      );
    } else if (sessionState.isActive) {
      steps.push(
        skippedStep(
          "expired_session_probe",
          "Attempt transfer with inactive session",
          "Session key is still active; skipping inactive-session negative probe.",
        ),
      );
    } else {
      steps.push(
        await runStep("expired_session_probe", "Attempt transfer with inactive session", async () => {
          try {
            await sidecar.callTool("starknet_transfer", {
              recipient: config.accountAddress,
              token: config.transferToken,
              amount: config.expiredSessionProbeAmount,
            });
          } catch (error) {
            if (isSessionRejectionError(error)) {
              return {
                expectedRejection: true,
                amount: config.expiredSessionProbeAmount,
                sessionState,
                reason: error instanceof Error ? error.message : String(error),
              };
            }
            throw error;
          }

          throw new Error(
            "Inactive session probe unexpectedly succeeded. Ensure proxy signer is using the intended session key.",
          );
        }),
      );
    }
  } else {
    steps.push(
      skippedStep(
        "expired_session_probe",
        "Attempt transfer with inactive session",
        "Only applicable in execute mode with STARKNET_SIGNER_MODE=proxy.",
      ),
    );
  }

  const vesuBefore = await runStep("vesu_positions_before", "Read Vesu position before write", async () => {
    const positions = await retryWithBackoff(() => sidecar.callTool("starknet_vesu_positions", vesuArgs));
    return { token: config.vesuToken, positions };
  });
  if (vesuBefore.status === "failed" && (isVesuUnavailableError(vesuBefore.error) || isTimeoutError(vesuBefore.error))) {
    steps.push(
      skippedStep(
        "vesu_positions_before",
        "Read Vesu position before write",
        isTimeoutError(vesuBefore.error)
          ? `Vesu position query timed out on ${config.networkLabel}.`
          : `Vesu pool is unavailable for ${config.networkLabel}.`,
      ),
    );
  } else {
    steps.push(vesuBefore);
  }

  const policyProbePassed = steps.some(
    (step) =>
      step.id === "policy_rejection_probe" &&
      step.status === "ok" &&
      Boolean(step.details && step.details.expectedRejection === true) &&
      (!config.strictSecurityProof || step.details?.onchainRevert === true),
  );

  if (config.mode === "execute" && policyProbePassed) {
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
      if (config.swapSellToken && config.swapAmount) {
        if (!hasTool(tools, "starknet_swap")) {
          steps.push(
            skippedStep(
              "swap_into_vesu_asset",
              "Swap into Vesu deposit asset",
              "Tool starknet_swap not exposed by MCP server",
            ),
          );
        } else {
          steps.push(
            await runStep("swap_into_vesu_asset", "Swap into Vesu deposit asset", async () => {
              const swap = await sidecar.callTool("starknet_swap", {
                sellToken: config.swapSellToken,
                buyToken: config.vesuToken,
                amount: config.swapAmount,
                slippage: config.swapSlippage ?? 0.02,
              });
              return {
                sellToken: config.swapSellToken,
                buyToken: config.vesuToken,
                amount: config.swapAmount,
                swap,
              };
            }),
          );
        }
      } else {
        steps.push(
          skippedStep(
            "swap_into_vesu_asset",
            "Swap into Vesu deposit asset",
            "Set DEMO_SWAP_SELL_TOKEN + DEMO_SWAP_AMOUNT to enable pre-deposit swap.",
          ),
        );
      }

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
      const positions = await retryWithBackoff(() => sidecar.callTool("starknet_vesu_positions", vesuArgs));
      return { token: config.vesuToken, positions };
    });
    if (vesuAfter.status === "failed" && (isVesuUnavailableError(vesuAfter.error) || isTimeoutError(vesuAfter.error))) {
      steps.push(
        skippedStep(
          "vesu_positions_after",
          "Read Vesu position after write",
          isTimeoutError(vesuAfter.error)
            ? `Vesu position query timed out on ${config.networkLabel}.`
            : `Vesu pool is unavailable for ${config.networkLabel}.`,
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
  } else if (config.mode === "execute") {
    const reason = "Skipping writes: policy rejection probe did not confirm guardrails.";
    steps.push(skippedStep("allowed_transfer_execute", "Execute allowed transfer", reason));
    steps.push(skippedStep("swap_into_vesu_asset", "Swap into Vesu deposit asset", reason));
    steps.push(skippedStep("vesu_deposit", "Execute Vesu deposit", reason));
    steps.push(skippedStep("vesu_positions_after", "Read Vesu position after write", reason));
    steps.push(skippedStep("vesu_withdraw", "Execute Vesu withdraw", reason));
  } else {
    steps.push(skippedStep("allowed_transfer_execute", "Execute allowed transfer", "Run with --mode execute"));
    steps.push(skippedStep("swap_into_vesu_asset", "Swap into Vesu deposit asset", "Run with --mode execute"));
    steps.push(skippedStep("vesu_deposit", "Execute Vesu deposit", "Run with --mode execute"));
    steps.push(skippedStep("vesu_positions_after", "Read Vesu position after write", "Run with --mode execute"));
    steps.push(skippedStep("vesu_withdraw", "Execute Vesu withdraw", "Run with --mode execute --with-withdraw"));
  }

  if (config.starkzapProofEnabled) {
    steps.push(
      await runStep("starkzap_receipt", "Attach Starkzap execution receipt evidence", async () => {
        const rawPath = config.starkzapEvidencePath;
        if (!rawPath) {
          throw new Error("Missing DEMO_STARKZAP_EVIDENCE_PATH");
        }
        const evidencePath = path.resolve(rawPath);
        if (!fs.existsSync(evidencePath)) {
          throw new Error(`Starkzap evidence file not found: ${evidencePath}`);
        }
        const raw = fs.readFileSync(evidencePath, "utf8");
        const txHash = extractTxHash(raw);
        if (!txHash) {
          throw new Error(`No Starkzap transaction hash found in evidence file: ${evidencePath}`);
        }
        return { evidencePath, transactionHash: txHash };
      }),
    );
  } else {
    steps.push(
      skippedStep(
        "starkzap_receipt",
        "Attach Starkzap execution receipt evidence",
        "Set DEMO_ENABLE_STARKZAP_PROOF=1 and DEMO_STARKZAP_EVIDENCE_PATH to enforce Starkzap proof claim.",
      ),
    );
  }

  const expectedArtifactPath = path.join(path.resolve(config.outputDir), `secure-defi-demo-${runId}.json`);
  const claims = buildClaims(steps, expectedArtifactPath, config.strictSecurityProof, config.starkzapProofEnabled);
  const missingRequiredClaims = claims.filter(
    (claim) => claim.required && claim.proof_status !== "proved",
  );

  if (config.strictSecurityProof) {
    const stamp = nowIso();
    if (missingRequiredClaims.length > 0) {
      steps.push({
        id: "strict_security_gate",
        title: "Enforce strict security proof gate",
        status: "failed",
        startedAt: stamp,
        endedAt: stamp,
        error: `Missing required claims: ${missingRequiredClaims.map((claim) => claim.claimId).join(", ")}`,
        details: {
          missingClaims: missingRequiredClaims.map((claim) => claim.claimId),
        },
      });
    } else {
      steps.push({
        id: "strict_security_gate",
        title: "Enforce strict security proof gate",
        status: "ok",
        startedAt: stamp,
        endedAt: stamp,
        details: {
          verifiedClaims: claims.filter((claim) => claim.required).map((claim) => claim.claimId),
        },
      });
    }
  }

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

  if (config.strictSecurityProof && missingRequiredClaims.length > 0) {
    recommendations.push(
      `Strict proof gate failed. Missing required claims: ${missingRequiredClaims
        .map((claim) => claim.claimId)
        .join(", ")}`,
    );
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
    strictSecurityProof: config.strictSecurityProof,
    baseAttestation,
    steps,
    summary,
    claims,
    recommendations,
  });

  const artifactPath = writeArtifact(artifact, config.outputDir);
  const markdownSummaryPath = writeMarkdownSummary(artifact, config.outputDir);
  let evidenceManifestPath: string | null = null;
  let evidenceManifestError: string | null = null;

  const shouldEmitEvidenceManifest =
    config.strictSecurityProof ||
    Boolean(config.evidenceSigningPrivateKeyPem) ||
    Boolean(config.evidenceSigningPrivateKeyPath) ||
    Boolean(config.evidenceSigningPrivateKeyBase64);

  if (shouldEmitEvidenceManifest) {
    try {
      const privateKeyPem = resolvePrivateKeyPem({
        privateKeyPem: config.evidenceSigningPrivateKeyPem,
        privateKeyPath: config.evidenceSigningPrivateKeyPath,
        privateKeyBase64: config.evidenceSigningPrivateKeyBase64,
      });
      if (!privateKeyPem) {
        throw new Error(
          "Missing evidence signing key. Set DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PEM, DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PATH, or DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_BASE64.",
        );
      }

      const evidenceFiles = [artifactPath, markdownSummaryPath];
      if (baseAttestation?.path) {
        evidenceFiles.push(copyEvidenceAttachment(baseAttestation.path, config.outputDir, runId, "base-attestation"));
      }
      if (config.starkzapProofEnabled && config.starkzapEvidencePath) {
        evidenceFiles.push(copyEvidenceAttachment(config.starkzapEvidencePath, config.outputDir, runId, "starkzap-evidence"));
      }

      const manifestResult = createSignedEvidenceManifest({
        manifestPath: path.join(config.outputDir, `artifact-manifest-${runId}.json`),
        privateKeyPem,
        runId,
        mode: config.mode,
        strictSecurityProof: config.strictSecurityProof,
        networkLabel: config.networkLabel,
        filePaths: evidenceFiles,
        claims,
      });
      verifyEvidenceManifestFile({
        manifestPath: manifestResult.manifestPath,
        requireStrict: config.strictSecurityProof,
      });
      evidenceManifestPath = manifestResult.manifestPath;
    } catch (error) {
      evidenceManifestError = error instanceof Error ? error.message : String(error);
      process.stderr.write(`secure-defi-demo evidence-manifest failed: ${evidenceManifestError}\n`);
    }
  }

  process.stdout.write(
    `${JSON.stringify({ artifactPath, markdownSummaryPath, evidenceManifestPath, evidenceManifestError, summary, recommendations }, null, 2)}\n`,
  );

  if (
    summary.failed > 0 ||
    (config.strictSecurityProof && missingRequiredClaims.length > 0) ||
    (shouldEmitEvidenceManifest && evidenceManifestError !== null)
  ) {
    process.exitCode = 1;
  }
  } finally {
    await sidecar.close().catch(() => {
      // Best-effort cleanup for subprocess resources.
    });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`secure-defi-demo failed: ${message}\n`);
  process.exitCode = 1;
});
