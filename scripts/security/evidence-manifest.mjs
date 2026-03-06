#!/usr/bin/env node

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const EVIDENCE_MANIFEST_VERSION = "1";
export const EVIDENCE_MANIFEST_TYPE = "secure-defi-evidence";
export const SIGNING_ALGORITHM = "ed25519";

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("Manifest contains non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }

  fail(`Unsupported value type in manifest: ${typeof value}`);
}

function decodeBase64Strict(label, value) {
  const normalized = value
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    fail(`${label} is not valid base64`);
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) {
    fail(`${label} is not valid base64`);
  }

  return decoded;
}

function normalizePem(value) {
  const trimmed = String(value).trim();
  if (trimmed.includes("\\n") && !trimmed.includes("\n")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return trimmed;
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readFileBuffer(filePath) {
  let data;
  try {
    data = fs.readFileSync(filePath);
  } catch (error) {
    fail(`Failed to read evidence file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return data;
}

function resolveRelativePath(baseDir, filePath) {
  const absoluteBase = path.resolve(baseDir);
  const absoluteFile = path.resolve(filePath);
  const relative = path.relative(absoluteBase, absoluteFile);

  if (!relative || relative === "") {
    return path.basename(absoluteFile);
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`Evidence file must be within bundle directory (${absoluteBase}): ${absoluteFile}`);
  }

  return relative.split(path.sep).join("/");
}

function validateSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    fail("Manifest file entry path must be a non-empty string");
  }
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("../") || normalized === "..") {
    fail(`Manifest file entry must be a safe relative path: ${relativePath}`);
  }
  return normalized;
}

function toTxReferences(claims) {
  if (!Array.isArray(claims)) return [];
  const map = new Map();

  for (const claim of claims) {
    if (!isPlainObject(claim)) continue;
    const claimId = typeof claim.claimId === "string" ? claim.claimId : null;
    const txHash = typeof claim.tx_hash === "string" && /^0x[0-9a-fA-F]+$/.test(claim.tx_hash)
      ? claim.tx_hash
      : null;
    if (!claimId || !txHash) continue;

    const key = `${claimId}:${txHash.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        claimId,
        txHash,
      });
    }
  }

  return [...map.values()].sort((left, right) => {
    const byId = left.claimId.localeCompare(right.claimId);
    if (byId !== 0) return byId;
    return left.txHash.localeCompare(right.txHash);
  });
}

function resolveGitCommit(cwd = process.cwd()) {
  try {
    const value = execSync("git rev-parse HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function collectEvidenceFiles(filePaths, bundleDir) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    fail("At least one evidence file path is required");
  }

  const uniqueByPath = new Map();

  for (const rawPath of filePaths) {
    if (typeof rawPath !== "string" || rawPath.trim() === "") {
      fail("Evidence file path must be a non-empty string");
    }

    const absolutePath = path.resolve(rawPath);
    const relativePath = resolveRelativePath(bundleDir, absolutePath);
    const buffer = readFileBuffer(absolutePath);
    uniqueByPath.set(relativePath, {
      path: relativePath,
      sha256: sha256Hex(buffer),
      bytes: buffer.length,
    });
  }

  return [...uniqueByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function assertUnsignedManifestShape(manifest) {
  if (!isPlainObject(manifest)) {
    fail("Manifest must be a JSON object");
  }
  if (manifest.version !== EVIDENCE_MANIFEST_VERSION) {
    fail(`Manifest version must be ${EVIDENCE_MANIFEST_VERSION}`);
  }
  if (manifest.type !== EVIDENCE_MANIFEST_TYPE) {
    fail(`Manifest type must be ${EVIDENCE_MANIFEST_TYPE}`);
  }
  if (typeof manifest.runId !== "string" || manifest.runId.trim() === "") {
    fail("Manifest runId must be a non-empty string");
  }
  if (typeof manifest.generatedAt !== "string" || manifest.generatedAt.trim() === "") {
    fail("Manifest generatedAt must be a non-empty string");
  }
  if (!isPlainObject(manifest.profile)) {
    fail("Manifest profile must be an object");
  }
  if (manifest.profile.mode !== "dry-run" && manifest.profile.mode !== "execute") {
    fail("Manifest profile.mode must be dry-run or execute");
  }
  if (typeof manifest.profile.strictSecurityProof !== "boolean") {
    fail("Manifest profile.strictSecurityProof must be boolean");
  }
  if (typeof manifest.profile.networkLabel !== "string" || manifest.profile.networkLabel.trim() === "") {
    fail("Manifest profile.networkLabel must be a non-empty string");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail("Manifest files must be a non-empty array");
  }

  for (const entry of manifest.files) {
    if (!isPlainObject(entry)) {
      fail("Manifest file entries must be objects");
    }
    validateSafeRelativePath(entry.path);
    if (!/^[a-f0-9]{64}$/.test(String(entry.sha256))) {
      fail(`Manifest file sha256 must be 64-char lowercase hex: ${entry.path}`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0) {
      fail(`Manifest file bytes must be a non-negative integer: ${entry.path}`);
    }
  }

  if (!isPlainObject(manifest.source)) {
    fail("Manifest source must be an object");
  }
  if (!isPlainObject(manifest.toolVersions)) {
    fail("Manifest toolVersions must be an object");
  }

  if (manifest.txReferences !== undefined) {
    if (!Array.isArray(manifest.txReferences)) {
      fail("Manifest txReferences must be an array when provided");
    }
    for (const ref of manifest.txReferences) {
      if (!isPlainObject(ref)) {
        fail("Manifest txReferences entries must be objects");
      }
      if (typeof ref.claimId !== "string" || ref.claimId.trim() === "") {
        fail("Manifest txReferences[].claimId must be a non-empty string");
      }
      if (!/^0x[0-9a-fA-F]+$/.test(String(ref.txHash))) {
        fail("Manifest txReferences[].txHash must be a hex transaction hash");
      }
    }
  }
}

function toUnsignedManifestForSignature(manifestWithSigning) {
  const {
    signing,
    ...unsigned
  } = manifestWithSigning;
  return unsigned;
}

function buildSigningMaterial(unsignedManifest, privateKeyPem) {
  const normalizedPrivateKeyPem = normalizePem(privateKeyPem);

  let privateKey;
  try {
    privateKey = createPrivateKey(normalizedPrivateKeyPem);
  } catch (error) {
    fail(`Invalid evidence signing private key: ${error instanceof Error ? error.message : String(error)}`);
  }

  const canonicalPayload = Buffer.from(canonicalize(unsignedManifest), "utf8");
  const signatureBase64 = sign(null, canonicalPayload, privateKey).toString("base64");

  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const publicKeyFingerprint = sha256Hex(
    publicKey.export({ type: "spki", format: "der" }),
  );

  return {
    algorithm: SIGNING_ALGORITHM,
    publicKeyPem,
    publicKeyFingerprint,
    signatureBase64,
  };
}

export function resolvePrivateKeyPem(options = {}) {
  const {
    privateKeyPem,
    privateKeyPath,
    privateKeyBase64,
  } = options;

  if (typeof privateKeyPem === "string" && privateKeyPem.trim() !== "") {
    return normalizePem(privateKeyPem);
  }

  if (typeof privateKeyBase64 === "string" && privateKeyBase64.trim() !== "") {
    return decodeBase64Strict("privateKeyBase64", privateKeyBase64).toString("utf8").trim();
  }

  if (typeof privateKeyPath === "string" && privateKeyPath.trim() !== "") {
    return readFileBuffer(path.resolve(privateKeyPath)).toString("utf8").trim();
  }

  return undefined;
}

export function resolvePrivateKeyPemFromEnv(env = process.env) {
  return resolvePrivateKeyPem({
    privateKeyPem: env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PEM,
    privateKeyPath: env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PATH,
    privateKeyBase64: env.DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_BASE64,
  });
}

export function createUnsignedEvidenceManifest(options) {
  const {
    runId,
    mode,
    strictSecurityProof,
    networkLabel,
    bundleDir,
    filePaths,
    claims,
    generatedAt,
    source,
    toolVersions,
  } = options ?? {};

  if (mode !== "dry-run" && mode !== "execute") {
    fail("Manifest mode must be dry-run or execute");
  }
  if (typeof runId !== "string" || runId.trim() === "") {
    fail("Manifest runId must be a non-empty string");
  }

  const resolvedBundleDir = path.resolve(bundleDir ?? process.cwd());
  const files = collectEvidenceFiles(filePaths, resolvedBundleDir);

  const manifest = {
    version: EVIDENCE_MANIFEST_VERSION,
    type: EVIDENCE_MANIFEST_TYPE,
    runId,
    generatedAt: generatedAt ?? new Date().toISOString(),
    profile: {
      mode,
      strictSecurityProof: strictSecurityProof === true,
      networkLabel: String(networkLabel ?? "unknown"),
    },
    source: {
      repository: source?.repository ?? process.env.GITHUB_REPOSITORY ?? null,
      commit: source?.commit ?? process.env.GITHUB_SHA ?? resolveGitCommit(),
      workflow: source?.workflow ?? process.env.GITHUB_WORKFLOW ?? null,
      workflowRunId: source?.workflowRunId ?? process.env.GITHUB_RUN_ID ?? null,
      actor: source?.actor ?? process.env.GITHUB_ACTOR ?? null,
    },
    toolVersions: {
      node: toolVersions?.node ?? process.version,
      packageManager: toolVersions?.packageManager ?? process.env.npm_config_user_agent ?? null,
    },
    txReferences: toTxReferences(claims),
    files,
  };

  assertUnsignedManifestShape(manifest);

  return manifest;
}

export function signEvidenceManifest(unsignedManifest, privateKeyPem) {
  assertUnsignedManifestShape(unsignedManifest);

  if (typeof privateKeyPem !== "string" || privateKeyPem.trim() === "") {
    fail("Evidence signing private key is required");
  }

  const signing = buildSigningMaterial(unsignedManifest, privateKeyPem);
  return {
    ...unsignedManifest,
    signing,
  };
}

function assertSignedManifestShape(signedManifest) {
  assertUnsignedManifestShape(toUnsignedManifestForSignature(signedManifest));

  if (!isPlainObject(signedManifest.signing)) {
    fail("Manifest signing must be an object");
  }
  if (signedManifest.signing.algorithm !== SIGNING_ALGORITHM) {
    fail(`Manifest signing.algorithm must be ${SIGNING_ALGORITHM}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(signedManifest.signing.publicKeyFingerprint))) {
    fail("Manifest signing.publicKeyFingerprint must be 64-char lowercase hex");
  }
  if (typeof signedManifest.signing.publicKeyPem !== "string" || signedManifest.signing.publicKeyPem.trim() === "") {
    fail("Manifest signing.publicKeyPem must be a non-empty PEM string");
  }
  if (typeof signedManifest.signing.signatureBase64 !== "string" || signedManifest.signing.signatureBase64.trim() === "") {
    fail("Manifest signing.signatureBase64 must be a non-empty base64 string");
  }
}

export function createSignedEvidenceManifest(options) {
  const {
    manifestPath,
    privateKeyPem,
  } = options ?? {};

  if (typeof manifestPath !== "string" || manifestPath.trim() === "") {
    fail("manifestPath is required");
  }

  const absoluteManifestPath = path.resolve(manifestPath);
  const bundleDir = path.dirname(absoluteManifestPath);

  const unsignedManifest = createUnsignedEvidenceManifest({
    ...options,
    bundleDir,
  });

  const signedManifest = signEvidenceManifest(unsignedManifest, privateKeyPem);
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(absoluteManifestPath, `${JSON.stringify(signedManifest, null, 2)}\n`, "utf8");

  return {
    manifestPath: absoluteManifestPath,
    manifest: signedManifest,
  };
}

export function loadEvidenceManifest(manifestPath) {
  const absolutePath = path.resolve(manifestPath);
  const raw = readFileBuffer(absolutePath).toString("utf8");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`Manifest is not valid JSON (${absolutePath}): ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    manifestPath: absolutePath,
    manifest: parsed,
  };
}

export function verifyEvidenceManifest(manifest, options = {}) {
  const {
    manifestDir = process.cwd(),
    requireStrict = false,
  } = options;

  assertSignedManifestShape(manifest);

  if (requireStrict && manifest.profile.strictSecurityProof !== true) {
    fail("Manifest profile.strictSecurityProof must be true when --require-strict is set");
  }

  const unsignedManifest = toUnsignedManifestForSignature(manifest);
  const payload = Buffer.from(canonicalize(unsignedManifest), "utf8");
  const signature = decodeBase64Strict("signing.signatureBase64", manifest.signing.signatureBase64);

  let publicKey;
  try {
    publicKey = createPublicKey(manifest.signing.publicKeyPem);
  } catch (error) {
    fail(`Manifest signing.publicKeyPem is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const expectedFingerprint = sha256Hex(
    publicKey.export({ type: "spki", format: "der" }),
  );
  if (expectedFingerprint !== manifest.signing.publicKeyFingerprint) {
    fail(
      `Manifest public key fingerprint mismatch (expected ${expectedFingerprint}, got ${manifest.signing.publicKeyFingerprint})`,
    );
  }

  const signatureOk = verify(null, payload, publicKey, signature);
  if (!signatureOk) {
    fail("Manifest signature verification failed");
  }

  const absoluteManifestDir = path.resolve(manifestDir);
  const verifiedFiles = [];

  for (const entry of manifest.files) {
    const safeRelativePath = validateSafeRelativePath(entry.path);
    const absoluteFilePath = path.resolve(absoluteManifestDir, safeRelativePath);
    const relativeCheck = path.relative(absoluteManifestDir, absoluteFilePath);
    if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
      fail(`Manifest file path escapes bundle directory: ${entry.path}`);
    }

    const data = readFileBuffer(absoluteFilePath);
    const actualHash = sha256Hex(data);
    if (actualHash !== entry.sha256) {
      fail(`Manifest hash mismatch for ${entry.path} (expected ${entry.sha256}, got ${actualHash})`);
    }
    if (data.length !== entry.bytes) {
      fail(`Manifest byte-size mismatch for ${entry.path} (expected ${entry.bytes}, got ${data.length})`);
    }

    verifiedFiles.push({
      path: safeRelativePath,
      sha256: actualHash,
      bytes: data.length,
    });
  }

  return {
    runId: manifest.runId,
    strictSecurityProof: manifest.profile.strictSecurityProof,
    verifiedFileCount: verifiedFiles.length,
    verifiedFiles,
    txReferenceCount: Array.isArray(manifest.txReferences) ? manifest.txReferences.length : 0,
    publicKeyFingerprint: manifest.signing.publicKeyFingerprint,
  };
}

export function verifyEvidenceManifestFile(options) {
  const {
    manifestPath,
    requireStrict = false,
  } = options ?? {};

  if (typeof manifestPath !== "string" || manifestPath.trim() === "") {
    fail("manifestPath is required");
  }

  const { manifestPath: absoluteManifestPath, manifest } = loadEvidenceManifest(manifestPath);
  const manifestDir = path.dirname(absoluteManifestPath);

  const summary = verifyEvidenceManifest(manifest, {
    manifestDir,
    requireStrict,
  });

  return {
    manifestPath: absoluteManifestPath,
    ...summary,
  };
}

function parseCliArgs(argv) {
  const args = {};
  const allowedFlags = new Set(["manifest", "require-strict", "help"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    if (!allowedFlags.has(name)) {
      fail(`Unknown flag: ${token}`);
    }
    if (name === "help") {
      args[name] = "true";
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for ${token}`);
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

function printUsage() {
  process.stderr.write("Usage: node scripts/security/evidence-manifest.mjs [--manifest <path>] [--require-strict] [--help]\n");
  process.stderr.write("Default manifest path fallback: $ARTIFACT_MANIFEST_PATH or examples/secure-defi-demo/artifacts/artifact-manifest.json\n");
}

export function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    process.stderr.write(`evidence-manifest: BLOCK (${error instanceof Error ? error.message : String(error)})\n`);
    printUsage();
    return 1;
  }

  if (parsed.help === "true") {
    printUsage();
    return 0;
  }

  const manifestPath =
    parsed.manifest ??
    process.env.ARTIFACT_MANIFEST_PATH ??
    "examples/secure-defi-demo/artifacts/artifact-manifest.json";
  const requireStrict = parsed["require-strict"] === "true";

  try {
    const summary = verifyEvidenceManifestFile({
      manifestPath,
      requireStrict,
    });

    process.stdout.write(`evidence-manifest: PASS (${summary.verifiedFileCount} files, runId=${summary.runId})\n`);
    return 0;
  } catch (error) {
    if (!parsed.manifest) {
      process.stderr.write(
        `evidence-manifest: BLOCK (default manifest not verified: ${error instanceof Error ? error.message : String(error)})\n`,
      );
      printUsage();
      return 1;
    }

    process.stderr.write(`evidence-manifest: BLOCK (${error instanceof Error ? error.message : String(error)})\n`);
    printUsage();
    return 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  process.exitCode = main();
}
