import { spawn } from "node:child_process";
import { z } from "zod";

import type { ExecutionOrderResult } from "./types.js";

type CommandRunInput = {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  stdinJson: Record<string, unknown>;
  timeoutMs: number;
};

type CommandRunOutput = {
  stdout: string;
  stderr: string;
};

type CommandRunner = (input: CommandRunInput) => Promise<CommandRunOutput>;

const placeShortResponseSchema = z.object({
  ok: z.literal(true),
  action: z.literal("place_short"),
  orderId: z.number().int().positive(),
  externalOrderId: z.string().min(1),
  status: z.string().min(1),
  statusReason: z.string().optional(),
  qty: z.number().positive(),
  filledQty: z.number().nonnegative(),
  price: z.number().positive(),
  averagePrice: z.number().positive(),
  filledNotionalUsd: z.number().nonnegative(),
});

const emptyActionSchema = z.object({
  ok: z.literal(true),
  action: z.union([z.literal("cancel_all"), z.literal("arm_deadman_switch")]),
});

const failureSchema = z.object({
  ok: z.literal(false),
  action: z.string().min(1),
  error: z.string().min(1),
});

export type ExtendedPerpExecutorConfig = {
  pythonBin: string;
  scriptPath: string;
  baseUrl: string;
  apiPrefix: string;
  apiKey: string;
  publicKey: string;
  privateKey: string;
  vaultNumber: number;
  slippageBps: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  commandTimeoutMs: number;
};

export type PlacePerpShortInput = {
  market: string;
  notionalUsd: number;
  markPrice: number;
};

export type PerpExecutionClient = {
  armDeadmanSwitch: (seconds: number) => Promise<void>;
  cancelAllOpenOrders: () => Promise<void>;
  placePerpShort: (input: PlacePerpShortInput) => Promise<ExecutionOrderResult>;
};

async function runCommand(input: CommandRunInput): Promise<CommandRunOutput> {
  return await new Promise<CommandRunOutput>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      env: {
        ...process.env,
        ...input.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, input.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Extended perp adapter timed out after ${input.timeoutMs}ms.`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `Extended perp adapter failed (exit=${code}). ${stderr.trim() || stdout.trim() || "No output"}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });

    child.stdin.write(`${JSON.stringify(input.stdinJson)}\n`, "utf8");
    child.stdin.end();
  });
}

function parseJsonLine(stdout: string): unknown {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw new Error("Extended perp adapter returned empty output.");
  }
  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`Extended perp adapter returned invalid JSON: ${lastLine}`);
  }
}

function parseActionResponse(stdout: string): unknown {
  const payload = parseJsonLine(stdout);
  const failed = failureSchema.safeParse(payload);
  if (failed.success) {
    throw new Error(`Extended perp adapter error (${failed.data.action}): ${failed.data.error}`);
  }
  return payload;
}

export class ExtendedPythonPerpExecutor implements PerpExecutionClient {
  constructor(
    private readonly config: ExtendedPerpExecutorConfig,
    private readonly commandRunner: CommandRunner = runCommand,
  ) {}

  private async invoke(
    action: "place_short" | "cancel_all" | "arm_deadman_switch",
    payload: Record<string, unknown>,
    timeoutMs = this.config.commandTimeoutMs,
  ): Promise<unknown> {
    const result = await this.commandRunner({
      command: this.config.pythonBin,
      args: [this.config.scriptPath, action],
      timeoutMs,
      stdinJson: {
        baseUrl: this.config.baseUrl,
        apiPrefix: this.config.apiPrefix,
        ...payload,
      },
      env: {
        EXTENDED_API_KEY: this.config.apiKey,
        EXTENDED_PUBLIC_KEY: this.config.publicKey,
        EXTENDED_PRIVATE_KEY: this.config.privateKey,
        EXTENDED_VAULT_NUMBER: String(this.config.vaultNumber),
      },
    });
    return parseActionResponse(result.stdout);
  }

  async armDeadmanSwitch(seconds: number): Promise<void> {
    const payload = await this.invoke("arm_deadman_switch", { seconds }, Math.max(5_000, seconds * 1000));
    emptyActionSchema.parse(payload);
  }

  async cancelAllOpenOrders(): Promise<void> {
    const payload = await this.invoke("cancel_all", {});
    emptyActionSchema.parse(payload);
  }

  async placePerpShort(input: PlacePerpShortInput): Promise<ExecutionOrderResult> {
    const payload = await this.invoke("place_short", {
      market: input.market,
      notionalUsd: input.notionalUsd,
      markPrice: input.markPrice,
      slippageBps: this.config.slippageBps,
      pollIntervalMs: this.config.pollIntervalMs,
      pollTimeoutMs: this.config.pollTimeoutMs,
    });

    const parsed = placeShortResponseSchema.parse(payload);
    return {
      orderId: parsed.externalOrderId,
      filledNotionalUsd: parsed.filledNotionalUsd,
    };
  }
}
