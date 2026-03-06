export type ResolvePrivateKeyPemOptions = {
  privateKeyPem?: string;
  privateKeyPath?: string;
  privateKeyBase64?: string;
};

export type CreateSignedEvidenceManifestOptions = {
  manifestPath: string;
  privateKeyPem: string;
  runId: string;
  mode: "dry-run" | "execute";
  strictSecurityProof: boolean;
  networkLabel: string;
  filePaths: string[];
  claims?: unknown[];
  generatedAt?: string;
  source?: Record<string, unknown>;
  toolVersions?: Record<string, unknown>;
};

export type VerifyEvidenceManifestFileOptions = {
  manifestPath: string;
  requireStrict?: boolean;
};

export type VerifyEvidenceManifestFileSummary = {
  manifestPath: string;
  runId: string;
  strictSecurityProof: boolean;
  verifiedFileCount: number;
  verifiedFiles: Array<{
    path: string;
    sha256: string;
    bytes: number;
  }>;
  txReferenceCount: number;
  publicKeyFingerprint: string;
};

export function createSignedEvidenceManifest(
  options: CreateSignedEvidenceManifestOptions,
): {
  manifestPath: string;
  manifest: unknown;
};

export function resolvePrivateKeyPem(
  options?: ResolvePrivateKeyPemOptions,
): string | undefined;

export function verifyEvidenceManifestFile(
  options: VerifyEvidenceManifestFileOptions,
): VerifyEvidenceManifestFileSummary;
