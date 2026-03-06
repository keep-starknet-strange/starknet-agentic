import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalize,
  createSignedEvidenceManifest,
  main,
  resolvePrivateKeyPem,
  verifyEvidenceManifestFile,
} from "./evidence-manifest.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "evidence-manifest-"));
}

function createSigningKeyPair() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

test("canonicalize sorts object keys deterministically", () => {
  const left = canonicalize({ z: 2, a: 1, nested: { b: 2, a: 1 } });
  const right = canonicalize({ nested: { a: 1, b: 2 }, a: 1, z: 2 });
  assert.equal(left, right);
});

test("createSignedEvidenceManifest + verifyEvidenceManifestFile succeeds", (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const artifactPath = path.join(tempDir, "secure-defi-demo.json");
  const markdownPath = path.join(tempDir, "secure-defi-demo.md");
  fs.writeFileSync(artifactPath, JSON.stringify({ strictSecurityProof: true, claims: [] }, null, 2));
  fs.writeFileSync(markdownPath, "# demo\n");

  const privateKeyPem = createSigningKeyPair();
  const manifestPath = path.join(tempDir, "artifact-manifest.json");

  createSignedEvidenceManifest({
    manifestPath,
    privateKeyPem,
    runId: "run-1",
    mode: "execute",
    strictSecurityProof: true,
    networkLabel: "starknet-sepolia",
    filePaths: [artifactPath, markdownPath],
    claims: [
      {
        claimId: "oversized_spend_denied",
        tx_hash: "0xabc",
      },
    ],
    source: {
      repository: "keep-starknet-strange/starknet-agentic",
      commit: "abc123",
    },
    toolVersions: {
      node: "v20.0.0",
      packageManager: "pnpm/10",
    },
    generatedAt: "2026-03-05T12:00:00.000Z",
  });

  const summary = verifyEvidenceManifestFile({
    manifestPath,
    requireStrict: true,
  });

  assert.equal(summary.runId, "run-1");
  assert.equal(summary.verifiedFileCount, 2);
  assert.equal(summary.txReferenceCount, 1);
});

test("verifyEvidenceManifestFile fails when strict profile is required but manifest is non-strict", (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const artifactPath = path.join(tempDir, "artifact.json");
  fs.writeFileSync(artifactPath, "{}\n");

  const privateKeyPem = createSigningKeyPair();
  const manifestPath = path.join(tempDir, "artifact-manifest.json");

  createSignedEvidenceManifest({
    manifestPath,
    privateKeyPem,
    runId: "run-2",
    mode: "execute",
    strictSecurityProof: false,
    networkLabel: "starknet-sepolia",
    filePaths: [artifactPath],
  });

  assert.throws(
    () => verifyEvidenceManifestFile({ manifestPath, requireStrict: true }),
    /profile\.strictSecurityProof must be true/,
  );
});

test("verifyEvidenceManifestFile fails on tampered file hash", (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const artifactPath = path.join(tempDir, "artifact.json");
  fs.writeFileSync(artifactPath, "{\"ok\":true}\n");

  const privateKeyPem = createSigningKeyPair();
  const manifestPath = path.join(tempDir, "artifact-manifest.json");

  createSignedEvidenceManifest({
    manifestPath,
    privateKeyPem,
    runId: "run-3",
    mode: "execute",
    strictSecurityProof: true,
    networkLabel: "starknet-sepolia",
    filePaths: [artifactPath],
  });

  fs.writeFileSync(artifactPath, "{\"ok\":false}\n");

  assert.throws(
    () => verifyEvidenceManifestFile({ manifestPath }),
    /Manifest hash mismatch/,
  );
});

test("verifyEvidenceManifestFile fails on tampered signature", (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const artifactPath = path.join(tempDir, "artifact.json");
  fs.writeFileSync(artifactPath, "{\"ok\":true}\n");

  const privateKeyPem = createSigningKeyPair();
  const manifestPath = path.join(tempDir, "artifact-manifest.json");

  createSignedEvidenceManifest({
    manifestPath,
    privateKeyPem,
    runId: "run-4",
    mode: "execute",
    strictSecurityProof: true,
    networkLabel: "starknet-sepolia",
    filePaths: [artifactPath],
  });

  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  parsed.signing.signatureBase64 = "ZmFrZVNpZ25hdHVyZQ==";
  fs.writeFileSync(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`);

  assert.throws(
    () => verifyEvidenceManifestFile({ manifestPath }),
    /Manifest signature verification failed/,
  );
});

test("createSignedEvidenceManifest fails when evidence file is outside bundle directory", (t) => {
  const rootTemp = makeTempDir();
  t.after(() => fs.rmSync(rootTemp, { recursive: true, force: true }));

  const bundleDir = path.join(rootTemp, "bundle");
  fs.mkdirSync(bundleDir, { recursive: true });

  const outsidePath = path.join(rootTemp, "outside.json");
  fs.writeFileSync(outsidePath, "{}\n");

  const manifestPath = path.join(bundleDir, "artifact-manifest.json");
  const privateKeyPem = createSigningKeyPair();

  assert.throws(
    () =>
      createSignedEvidenceManifest({
        manifestPath,
        privateKeyPem,
        runId: "run-5",
        mode: "execute",
        strictSecurityProof: true,
        networkLabel: "starknet-sepolia",
        filePaths: [outsidePath],
      }),
    /must be within bundle directory/,
  );
});

test("resolvePrivateKeyPem supports base64-encoded PEM", () => {
  const privateKeyPem = createSigningKeyPair();
  const encoded = Buffer.from(privateKeyPem, "utf8").toString("base64");

  const resolved = resolvePrivateKeyPem({
    privateKeyBase64: encoded,
  });

  assert.equal(resolved, privateKeyPem.trim());
});

test("main returns 0 for --help", () => {
  const exitCode = main(["--help"]);
  assert.equal(exitCode, 0);
});

test("main honors ARTIFACT_MANIFEST_PATH fallback", (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const artifactPath = path.join(tempDir, "artifact.json");
  fs.writeFileSync(artifactPath, "{\"ok\":true}\n");
  const privateKeyPem = createSigningKeyPair();
  const manifestPath = path.join(tempDir, "artifact-manifest.json");
  createSignedEvidenceManifest({
    manifestPath,
    privateKeyPem,
    runId: "run-env",
    mode: "execute",
    strictSecurityProof: true,
    networkLabel: "starknet-sepolia",
    filePaths: [artifactPath],
  });

  const previous = process.env.ARTIFACT_MANIFEST_PATH;
  process.env.ARTIFACT_MANIFEST_PATH = manifestPath;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.ARTIFACT_MANIFEST_PATH;
    } else {
      process.env.ARTIFACT_MANIFEST_PATH = previous;
    }
  });

  const exitCode = main([]);
  assert.equal(exitCode, 0);
});
