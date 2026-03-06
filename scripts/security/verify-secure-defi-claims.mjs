#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_CLAIM_IDS = [
  "oversized_spend_denied",
  "forbidden_selector_denied",
  "revoked_or_expired_session_blocked",
  "erc8004_identity_path",
  "base_to_starknet_anchor_verified",
  "starkzap_execution_receipt",
];
const OPTIONAL_POLICY_CLAIM_IDS = new Set([
  "starkzap_execution_receipt",
]);

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[name] = "true";
      continue;
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

export function loadArtifact(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function verifyClaimsArtifact(artifact, options = {}) {
  const { requireStrict = false } = options;
  const claims = Array.isArray(artifact?.claims) ? artifact.claims : [];
  const byId = new Map(claims.map((claim) => [String(claim?.claimId), claim]));

  if (requireStrict && artifact?.strictSecurityProof !== true) {
    throw new Error("strictSecurityProof is not true in artifact");
  }

  const missingClaimEntries = REQUIRED_CLAIM_IDS.filter((id) => !byId.has(id));
  if (missingClaimEntries.length > 0) {
    throw new Error(
      `missing claim entries: ${missingClaimEntries.join(", ")}`,
    );
  }

  const blocking = claims.filter((claim) => {
    const claimId = String(claim?.claimId ?? "");
    if (!REQUIRED_CLAIM_IDS.includes(claimId)) {
      return false;
    }
    const policyRequired =
      !OPTIONAL_POLICY_CLAIM_IDS.has(claimId) || claim?.required === true;
    return policyRequired && String(claim?.proof_status) !== "proved";
  });
  if (blocking.length > 0) {
    const details = blocking
      .map(
        (claim) =>
          `${claim.claimId} failed (status=${claim.proof_status}, tx_hash=${claim.tx_hash ?? "null"}, evidence_path=${claim.evidence_path ?? "unknown"})`,
      )
      .join("; ");
    throw new Error(details);
  }

  return { claimsCount: claims.length };
}

function printUsage() {
  console.error("Usage: node scripts/security/verify-secure-defi-claims.mjs --artifact <path> [--require-strict]");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const artifactPath = args.artifact;
  const requireStrict = args["require-strict"] === "true" || args["require-strict"] === true;

  if (!artifactPath) {
    printUsage();
    return 2;
  }

  try {
    const artifact = loadArtifact(artifactPath);
    const summary = verifyClaimsArtifact(artifact, { requireStrict });
    console.log(`strict-proof-gate: PASS (${summary.claimsCount} claims validated from ${artifactPath})`);
    return 0;
  } catch (error) {
    console.error("strict-proof-gate: BLOCK");
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  process.exitCode = main();
}
