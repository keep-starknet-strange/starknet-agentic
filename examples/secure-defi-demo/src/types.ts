import { z } from "zod";

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

export const RunConfigSchema = z.object({
  mode: z.enum(["dry-run", "execute"]),
  networkLabel: z.string().min(1),
  mcpEntry: z.string().min(1),
  accountAddress: z.string().startsWith("0x"),
  signerMode: z.enum(["direct", "proxy"]),
  transferToken: z.string().min(1),
  transferAmount: z.string().min(1),
  rejectionProbeAmount: z.string().min(1),
  swapSellToken: z.string().min(1).optional(),
  swapAmount: z.string().min(1).optional(),
  swapSlippage: z.number().positive().max(0.5).optional(),
  vesuToken: z.string().min(1),
  vesuPool: z.string().startsWith("0x").optional(),
  vesuDepositAmount: z.string().min(1),
  vesuWithdrawAmount: z.string().optional(),
  agentId: z.string().optional(),
  sessionAccountAddress: z.string().startsWith("0x").optional(),
  sessionKeyPublicKey: z.string().startsWith("0x").optional(),
  expiredSessionProbeAmount: z.string().min(1),
  outputDir: z.string().min(1),
});

export type RunConfig = z.infer<typeof RunConfigSchema>;

export const SessionStateSchema = z.object({
  accountAddress: z.string().startsWith("0x"),
  sessionPublicKey: z.string().startsWith("0x"),
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
  accountAddress: z.string().startsWith("0x"),
  signerMode: z.enum(["direct", "proxy"]),
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
