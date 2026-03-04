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
  vesuToken: z.string().min(1),
  vesuPool: z.string().startsWith("0x").optional(),
  vesuDepositAmount: z.string().min(1),
  vesuWithdrawAmount: z.string().optional(),
  agentId: z.string().optional(),
  sessionAccountAddress: z.string().startsWith("0x").optional(),
  sessionKeyPublicKey: z.string().startsWith("0x").optional(),
  outputDir: z.string().min(1),
});

export type RunConfig = z.infer<typeof RunConfigSchema>;

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
