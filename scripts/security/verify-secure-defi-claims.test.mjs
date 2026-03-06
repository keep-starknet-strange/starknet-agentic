import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  main,
  parseArgs,
  verifyClaimsArtifact,
  REQUIRED_CLAIM_IDS,
} from "./verify-secure-defi-claims.mjs";

function makeArtifact(overrides = {}) {
  const claims = REQUIRED_CLAIM_IDS.map((claimId) => ({
    claimId,
    required: claimId !== "starkzap_execution_receipt",
    proof_status: claimId === "starkzap_execution_receipt" ? "not_applicable" : "proved",
    tx_hash: claimId === "oversized_spend_denied" ? "0x111" : null,
    evidence_path: `steps.${claimId}`,
  }));

  return {
    strictSecurityProof: true,
    claims,
    ...overrides,
  };
}

function writeTempArtifact(artifact) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-secure-defi-claims-"));
  const artifactPath = path.join(tempDir, "artifact.json");
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { tempDir, artifactPath };
}

test("parseArgs handles flags and key/value pairs", () => {
  const args = parseArgs(["--artifact", "a.json", "--require-strict"]);
  assert.equal(args.artifact, "a.json");
  assert.equal(args["require-strict"], "true");
});

test("verifyClaimsArtifact passes for valid strict artifact", () => {
  const summary = verifyClaimsArtifact(makeArtifact(), { requireStrict: true });
  assert.equal(summary.claimsCount, REQUIRED_CLAIM_IDS.length);
});

test("verifyClaimsArtifact fails when strict flag is required but not enabled", () => {
  assert.throws(
    () => verifyClaimsArtifact(makeArtifact({ strictSecurityProof: false }), { requireStrict: true }),
    /strictSecurityProof is not true/,
  );
});

test("verifyClaimsArtifact fails when claim entries are missing", () => {
  const artifact = makeArtifact({
    claims: makeArtifact().claims.filter((claim) => claim.claimId !== "erc8004_identity_path"),
  });
  assert.throws(
    () => verifyClaimsArtifact(artifact, { requireStrict: true }),
    /missing claim entries: erc8004_identity_path/,
  );
});

test("verifyClaimsArtifact fails when required claim is not proved", () => {
  const artifact = makeArtifact({
    claims: makeArtifact().claims.map((claim) =>
      claim.claimId === "forbidden_selector_denied"
        ? { ...claim, required: true, proof_status: "missing" }
        : claim,
    ),
  });

  assert.throws(
    () => verifyClaimsArtifact(artifact, { requireStrict: true }),
    /forbidden_selector_denied failed/,
  );
});

test("verifyClaimsArtifact fails when mandatory claim is not proved even if required=false", () => {
  const artifact = makeArtifact({
    claims: makeArtifact().claims.map((claim) =>
      claim.claimId === "forbidden_selector_denied"
        ? { ...claim, required: false, proof_status: "missing" }
        : claim,
    ),
  });

  assert.throws(
    () => verifyClaimsArtifact(artifact, { requireStrict: true }),
    /forbidden_selector_denied failed/,
  );
});

test("main returns 0 for valid artifact file", (t) => {
  const { tempDir, artifactPath } = writeTempArtifact(makeArtifact());
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const exitCode = main(["--artifact", artifactPath, "--require-strict"]);
  assert.equal(exitCode, 0);
});

test("main returns 1 for invalid artifact file", (t) => {
  const { tempDir, artifactPath } = writeTempArtifact(makeArtifact({ strictSecurityProof: false }));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const exitCode = main(["--artifact", artifactPath, "--require-strict"]);
  assert.equal(exitCode, 1);
});
