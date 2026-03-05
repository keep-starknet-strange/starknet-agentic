import { z } from "zod";

const StarknetAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/, "Must be a valid Starknet hex address");
const DecimalAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Must be a non-negative decimal amount");

export const SecurityClaimIdSchema = z.enum([
  "oversized_spend_denied",
  "forbidden_selector_denied",
  "revoked_or_expired_session_blocked",
  "erc8004_identity_path",
  "base_to_starknet_anchor_verified",
  "starkzap_execution_receipt",
]);
export const SecurityClaimStatusSchema = z.enum(["proved", "missing", "not_applicable"]);
export const SecurityClaimSchema = z.object({
  claimId: SecurityClaimIdSchema,
  proof_status: SecurityClaimStatusSchema,
  required: z.boolean(),
  tx_hash: z.string().regex(/^0x[0-9a-fA-F]+$/).nullable(),
  evidence_path: z.string().min(1),
  note: z.string().min(1).optional(),
});

export const StepStatusSchema = z.enum(["ok", "failed", "skipped"]);

export const StepResultSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: StepStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  details: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

export type StepResult = z.infer<typeof StepResultSchema>;
export type SecurityClaim = z.infer<typeof SecurityClaimSchema>;

export const RunConfigSchema = z
  .object({
    mode: z.enum(["dry-run", "execute"]),
    networkLabel: z.string().min(1),
    rpcUrl: z.string().url(),
    mcpEntry: z.string().min(1),
    accountAddress: StarknetAddressSchema,
    signerMode: z.enum(["direct", "proxy"]),
    transferToken: z.string().min(1),
    transferAmount: DecimalAmountSchema,
    rejectionProbeAmount: DecimalAmountSchema,
    swapSellToken: z.string().min(1).optional(),
    swapAmount: DecimalAmountSchema.optional(),
    swapSlippage: z.number().positive().max(0.5).optional(),
    vesuToken: z.string().min(1),
    vesuPool: StarknetAddressSchema.optional(),
    vesuDepositAmount: DecimalAmountSchema,
    vesuWithdrawAmount: DecimalAmountSchema.optional(),
    identityRegistryAddress: StarknetAddressSchema.optional(),
    agentId: z.string().optional(),
    autoRegisterAgent: z.boolean().default(false),
    agentTokenUri: z.string().optional(),
    anchorBaseToErc8004: z.boolean().default(false),
    baseAnchorMetadataKey: z.string().min(1).default("baseAttestationSha256"),
    sessionAccountAddress: StarknetAddressSchema.optional(),
    sessionKeyPublicKey: StarknetAddressSchema.optional(),
    expiredSessionProbeAmount: DecimalAmountSchema,
    strictSecurityProof: z.boolean().default(false),
    starkzapProofEnabled: z.boolean().default(false),
    starkzapEvidencePath: z.string().min(1).optional(),
    evidenceSigningPrivateKeyPem: z.string().min(1).optional(),
    evidenceSigningPrivateKeyPath: z.string().min(1).optional(),
    evidenceSigningPrivateKeyBase64: z.string().min(1).optional(),
    outputDir: z.string().min(1),
  })
  .superRefine((cfg, ctx) => {
    const hasSwapSellToken = typeof cfg.swapSellToken === "string";
    const hasSwapAmount = typeof cfg.swapAmount === "string";
    if (hasSwapSellToken !== hasSwapAmount) {
      ctx.addIssue({
        code: "custom",
        path: hasSwapSellToken ? ["swapAmount"] : ["swapSellToken"],
        message: "swapSellToken and swapAmount must be provided together",
      });
    }

    const hasSessionAccountAddress = typeof cfg.sessionAccountAddress === "string";
    const hasSessionKeyPublicKey = typeof cfg.sessionKeyPublicKey === "string";
    if (hasSessionAccountAddress !== hasSessionKeyPublicKey) {
      ctx.addIssue({
        code: "custom",
        path: hasSessionAccountAddress ? ["sessionKeyPublicKey"] : ["sessionAccountAddress"],
        message: "sessionAccountAddress and sessionKeyPublicKey must be provided together",
      });
    }

    if (cfg.strictSecurityProof && cfg.mode !== "execute") {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: "STRICT_SECURITY_PROOF requires --mode execute",
      });
    }

    if (cfg.starkzapProofEnabled && !cfg.starkzapEvidencePath) {
      ctx.addIssue({
        code: "custom",
        path: ["starkzapEvidencePath"],
        message: "DEMO_STARKZAP_EVIDENCE_PATH is required when DEMO_ENABLE_STARKZAP_PROOF=1",
      });
    }

    const hasEvidenceSigningKey =
      Boolean(cfg.evidenceSigningPrivateKeyPem) ||
      Boolean(cfg.evidenceSigningPrivateKeyPath) ||
      Boolean(cfg.evidenceSigningPrivateKeyBase64);
    if (cfg.strictSecurityProof && !hasEvidenceSigningKey) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceSigningPrivateKeyPem"],
        message:
          "STRICT_SECURITY_PROOF requires one of DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PEM, DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PATH, or DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_BASE64",
      });
    }
  });

export type RunConfig = z.infer<typeof RunConfigSchema>;

export const SessionStateSchema = z.object({
  accountAddress: StarknetAddressSchema,
  sessionPublicKey: StarknetAddressSchema,
  validUntil: z.number().int().nonnegative(),
  validUntilISO: z.string().datetime().nullable(),
  maxCalls: z.number().int().nonnegative(),
  callsUsed: z.number().int().nonnegative(),
  callsRemaining: z.number().int().nonnegative(),
  allowedEntrypointsLen: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const DemoArtifactSchema = z.object({
  runId: z.string().min(1),
  issue: z.string().min(1),
  mode: z.enum(["dry-run", "execute"]),
  networkLabel: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  accountAddress: StarknetAddressSchema,
  signerMode: z.enum(["direct", "proxy"]),
  strictSecurityProof: z.boolean().default(false),
  baseAttestation: z
    .object({
      path: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      schemaVersion: z.literal("1"),
      issuer: z.string().min(1),
      subject: z.string().min(1),
      issuedAt: z.string().datetime(),
      algorithm: z.literal("ed25519"),
      payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
      publicKeyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      verified: z.literal(true),
    })
    .optional(),
  steps: z.array(StepResultSchema).min(1),
  summary: z.object({
    totalSteps: z.number().int().nonnegative(),
    ok: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  claims: z.array(SecurityClaimSchema).default([]),
  recommendations: z.array(z.string()),
});

export type DemoArtifact = z.infer<typeof DemoArtifactSchema>;

export function buildSummary(steps: StepResult[]): DemoArtifact["summary"] {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const step of steps) {
    if (step.status === "ok") ok += 1;
    else if (step.status === "failed") failed += 1;
    else skipped += 1;
  }
  return {
    totalSteps: steps.length,
    ok,
    failed,
    skipped,
  };
}
