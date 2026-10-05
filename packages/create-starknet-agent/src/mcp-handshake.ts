/**
 * MCP server health check for `create-starknet-agent verify`.
 *
 * Starts the server the way an MCP client would (the `command`, `args` and
 * `env` of the configured `mcpServers.starknet` entry), sends an MCP
 * `initialize` request over stdio, then `tools/list`, and reports what the
 * server answered.
 *
 * This speaks newline-delimited JSON-RPC 2.0 directly instead of using
 * `@modelcontextprotocol/sdk`: the CLI is run through `npx`, the SDK is not one
 * of its dependencies and would add ~17 runtime dependencies (express, hono,
 * ajv, ...) for three messages, and its stdio transport does not let us kill
 * the whole process tree (`npx` -> node) that a timeout or Ctrl-C leaves behind.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";

/** Default time allowed for spawn + initialize + tools/list. The first `npx` run downloads the server. */
export const DEFAULT_MCP_HANDSHAKE_TIMEOUT_MS = 60_000;

/** MCP protocol revision sent in `initialize`. Servers answer with the revision they support. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

const CLIENT_INFO = { name: "create-starknet-agent-verify", version: "1.0.0" } as const;

/** Grace period between SIGTERM and SIGKILL when stopping the server. */
const KILL_GRACE_MS = 2_000;

/** Upper bound on buffered stderr, so a chatty server cannot grow memory without bound. */
const MAX_STDERR_CHARS = 64 * 1024;

/** Upper bound on a single stdout line, for the same reason. */
const MAX_STDOUT_LINE_CHARS = 4 * 1024 * 1024;

const MAX_TOOLS_LIST_PAGES = 20;

/** How the configured MCP server is launched (`mcpServers.<name>` in an MCP client config). */
export interface McpServerLaunch {
  command: string;
  args?: string[];
  env?: Record<string, unknown>;
}

export type McpHandshakeStatus =
  | "ok"
  /** The server refused to start and named the environment variables it needs. */
  | "missing-env"
  /** No complete handshake before the deadline. */
  | "timeout"
  /** The process exited before answering `initialize`. */
  | "exited"
  /** The command could not be started at all (e.g. not on PATH). */
  | "spawn-error"
  /** The server answered, but not with a valid MCP `initialize` result. */
  | "protocol-error";

export interface McpHandshakeResult {
  ok: boolean;
  status: McpHandshakeStatus;
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  /** Number of tools from `tools/list`; undefined when that call failed. */
  toolCount?: number;
  /** Why `tools/list` could not be counted, when `initialize` succeeded. */
  toolsListError?: string;
  durationMs: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  /** Environment variables the server reported as missing or invalid. */
  missingEnv?: string[];
  /** `${VAR}` placeholders in the config `env` block that are not set in the environment. */
  unresolvedEnv?: string[];
  /** Human-readable reason when `ok` is false. Secrets are redacted. */
  message?: string;
  /** Last lines of the server's stderr. Secrets are redacted. */
  stderrTail?: string;
}

/** Minimal event source for termination signals; `process` in production. */
export interface SignalSource {
  once(event: "SIGINT" | "SIGTERM" | "exit", listener: (...args: unknown[]) => void): unknown;
  removeListener(event: "SIGINT" | "SIGTERM" | "exit", listener: (...args: unknown[]) => void): unknown;
}

export interface McpHandshakeOptions {
  /** Hard deadline for the whole check. Default {@link DEFAULT_MCP_HANDSHAKE_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Environment the MCP client itself runs in. Default `process.env`. */
  baseEnv?: NodeJS.ProcessEnv;
  /** Working directory for the server. Default `process.cwd()`. */
  cwd?: string;
  /** Where SIGINT/SIGTERM/exit are observed. Default `process`. */
  signalSource?: SignalSource;
  /** Called after the server was killed because of SIGINT/SIGTERM. Default exits with 128 + signal number. */
  onSignal?: (signal: "SIGINT" | "SIGTERM") => void;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERN = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Build the environment the server is started with: the client's own
 * environment, overlaid with the config's `env` block. `${VAR}`,
 * `${VAR:-default}` and Cursor's `${env:VAR}` are expanded from the client's
 * environment, as MCP clients do. A value that references an unset variable is
 * left out entirely rather than passed through as a literal `${VAR}`.
 */
export function resolveLaunchEnv(
  configEnv: Record<string, unknown> | undefined,
  baseEnv: NodeJS.ProcessEnv
): { env: NodeJS.ProcessEnv; unresolved: string[] } {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const unresolved = new Set<string>();

  for (const [key, raw] of Object.entries(configEnv ?? {})) {
    if (raw === undefined || raw === null) continue;
    const value = String(raw);
    let missing = false;
    const expanded = value.replace(PLACEHOLDER_PATTERN, (_match, name: string, fallback?: string) => {
      const fromEnv = baseEnv[name];
      if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
      if (fallback !== undefined) return fallback;
      missing = true;
      unresolved.add(name);
      return "";
    });
    if (missing) {
      delete env[key];
    } else {
      env[key] = expanded;
    }
  }

  return { env, unresolved: [...unresolved] };
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_ENV_KEY =
  /PRIVATE|SECRET|API_?KEY|TOKEN|PASSWORD|PASSPHRASE|HMAC|MNEMONIC|SEED|CREDENTIAL|_URL$/i;

/**
 * Redact the parts of a URL that commonly carry credentials: userinfo, query
 * values and long opaque path segments (Alchemy/Infura-style API keys).
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "[redacted-url]";
  }
  if (parsed.username) parsed.username = "redacted";
  if (parsed.password) parsed.password = "redacted";
  for (const key of [...parsed.searchParams.keys()]) {
    parsed.searchParams.set(key, "redacted");
  }
  parsed.pathname = parsed.pathname
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{20,}$/.test(segment) ? "[redacted]" : segment))
    .join("/");
  return parsed.toString().replace(/%5Bredacted%5D/g, "[redacted]");
}

/**
 * Return a function that strips secrets from text before it is printed:
 * values of sensitive variables in `env`, long hex strings (private keys) and
 * credentials embedded in URLs.
 */
export function createRedactor(env: NodeJS.ProcessEnv): (text: string) => string {
  const secrets = Object.entries(env)
    .filter(([key, value]) => SENSITIVE_ENV_KEY.test(key) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);

  return (text: string) => {
    let out = text;
    for (const secret of secrets) {
      out = out.split(secret).join("[redacted]");
    }
    out = out.replace(/0x[0-9a-fA-F]{40,}/g, "0x[redacted]");
    out = out.replace(/https?:\/\/[^\s"'<>`]+/g, (match) => redactUrl(match));
    return out;
  };
}

// ---------------------------------------------------------------------------
// stderr interpretation
// ---------------------------------------------------------------------------

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Pull the environment variable names a server complained about out of its
 * stderr. Understands the two shapes starknet-agentic-mcp-server uses: a zod
 * error listing `"path": ["STARKNET_RPC_URL"]`, and `Missing X for ...` /
 * `Missing ... (X, Y)` errors.
 */
export function extractEnvProblems(stderr: string): string[] {
  const names = new Set<string>();

  for (const match of stderr.matchAll(/"path"\s*:\s*\[\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)) {
    names.add(match[1]);
  }
  for (const match of stderr.matchAll(/\bMissing ([A-Z][A-Z0-9_]{2,})\b/g)) {
    names.add(match[1]);
  }
  for (const match of stderr.matchAll(/\bMissing [^\n(]*\(([A-Z0-9_,\s]+)\)/g)) {
    for (const name of match[1].split(",")) {
      names.add(name.trim());
    }
  }

  return [...names].filter((name) => ENV_NAME.test(name));
}

/** One line that best explains why a process failed, for a short summary. */
function summarizeStderr(stderr: string): string | undefined {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;
  const errorLine =
    lines.find((line) => /^(\w*Error\b|npm (error|ERR!)|sh: |.*command not found|.*not recognized)/.test(line)) ??
    lines[lines.length - 1];
  return errorLine.length > 300 ? `${errorLine.slice(0, 300)}...` : errorLine;
}

function tail(text: string, lines: number): string {
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(-lines).join("\n");
}

// ---------------------------------------------------------------------------
// Process control
// ---------------------------------------------------------------------------

const useProcessGroup = process.platform !== "win32";

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/**
 * Signal the server and everything it spawned. On POSIX the server runs as
 * the leader of its own process group (`detached: true`), so `npx` and the
 * node process it starts are signalled together.
 */
function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  if (!useProcessGroup) {
    // Windows has no process groups or POSIX signals; taskkill /T stops the
    // shell, npx and the server together. Skip it once the child has exited,
    // because Windows reuses PIDs quickly.
    if (isRunning(child)) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    }
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Group already gone (ESRCH). Fall back to the direct child.
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}

function waitForExit(child: ChildProcess, ms: number): Promise<void> {
  if (!isRunning(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      child.removeListener("exit", done);
      resolve();
    }
    child.once("exit", done);
  });
}

/** Stop the server: SIGTERM, then SIGKILL after a grace period. Always sweeps the process group. */
async function stopTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return; // Never started (spawn error).
  if (isRunning(child)) {
    signalTree(child, "SIGTERM");
    await waitForExit(child, KILL_GRACE_MS);
  }
  // Also catches grandchildren that outlived the direct child.
  signalTree(child, "SIGKILL");
  await waitForExit(child, KILL_GRACE_MS);
}

const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown } | unknown;
}

class HandshakeFailure extends Error {
  constructor(
    readonly status: Exclude<McpHandshakeStatus, "ok">,
    message: string
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rpcErrorMessage(error: unknown): string {
  if (isObject(error) && typeof error.message === "string") {
    return typeof error.code === "number" ? `${error.message} (code ${error.code})` : error.message;
  }
  return "unknown error";
}

/**
 * Start the configured MCP server, perform the MCP handshake over stdio and
 * stop the server again. Never throws; every failure is described in the
 * result. The server process (and anything it spawned) is always killed before
 * this resolves, and on SIGINT/SIGTERM while the check runs.
 */
export async function checkMcpServerHealth(
  launch: McpServerLaunch,
  options: McpHandshakeOptions = {}
): Promise<McpHandshakeResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_HANDSHAKE_TIMEOUT_MS;
  const baseEnv = options.baseEnv ?? process.env;
  const signalSource: SignalSource = options.signalSource ?? process;
  const onSignal =
    options.onSignal ?? ((signal: "SIGINT" | "SIGTERM") => process.exit(SIGNAL_EXIT_CODES[signal]));

  const { env, unresolved } = resolveLaunchEnv(launch.env, baseEnv);
  const redact = createRedactor(env);
  const base = (): Pick<McpHandshakeResult, "durationMs" | "unresolvedEnv"> => ({
    durationMs: Date.now() - startedAt,
    ...(unresolved.length > 0 ? { unresolvedEnv: unresolved } : {}),
  });

  let child: ChildProcess;
  try {
    child = spawn(launch.command, launch.args ?? [], {
      cwd: options.cwd ?? process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: useProcessGroup,
      // npx/npm are .cmd shims on Windows, which cannot be spawned without a shell.
      shell: process.platform === "win32",
      windowsHide: true,
    });
  } catch (error) {
    return {
      ok: false,
      status: "spawn-error",
      message: redact(
        `Could not start MCP server command "${launch.command}": ${error instanceof Error ? error.message : String(error)}`
      ),
      ...base(),
    };
  }

  // Kill the server if verify itself is interrupted or exits while the check runs.
  const killNow = () => signalTree(child, "SIGKILL");
  const handleSigint = () => {
    killNow();
    onSignal("SIGINT");
  };
  const handleSigterm = () => {
    killNow();
    onSignal("SIGTERM");
  };
  signalSource.once("SIGINT", handleSigint);
  signalSource.once("SIGTERM", handleSigterm);
  signalSource.once("exit", killNow);

  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
    if (stderr.length > MAX_STDERR_CHARS) {
      // Drop the cut-off first line too: half a secret would slip past redaction.
      stderr = stderr.slice(-MAX_STDERR_CHARS);
      stderr = stderr.slice(stderr.indexOf("\n") + 1);
    }
  });
  // Writing to a server that already exited raises EPIPE on stdin; the exit handler reports it.
  child.stdin?.on("error", () => {});

  const pending = new Map<number, { resolve: (msg: JsonRpcMessage) => void }>();
  let nextId = 1;
  let rejectAll: (failure: HandshakeFailure) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    rejectAll = reject;
  });
  failed.catch(() => {});

  const send = (message: Record<string, unknown>) => {
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  };
  const request = (method: string, params: Record<string, unknown>): Promise<JsonRpcMessage> => {
    const id = nextId++;
    const response = new Promise<JsonRpcMessage>((resolve) => pending.set(id, { resolve }));
    send({ id, method, params });
    return Promise.race([response, failed]);
  };

  let stdoutBuffer = "";
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      rejectAll(
        new HandshakeFailure(
          "protocol-error",
          // Redact before truncating, so a secret cannot be cut into an unrecognisable prefix.
          `MCP server wrote non-JSON-RPC output to stdout: ${JSON.stringify(redact(trimmed).slice(0, 120))}`
        )
      );
      return;
    }
    if (!isObject(message) || message.jsonrpc !== "2.0") {
      rejectAll(new HandshakeFailure("protocol-error", "MCP server sent a message that is not JSON-RPC 2.0"));
      return;
    }
    const msg = message as JsonRpcMessage;
    if (typeof msg.method === "string") {
      // A request from the server (e.g. ping, roots/list): answer so it is not left waiting.
      if (msg.id !== undefined && msg.id !== null) {
        if (msg.method === "ping") {
          send({ id: msg.id, result: {} });
        } else {
          send({ id: msg.id, error: { code: -32601, message: "Method not found" } });
        }
      }
      return; // Notifications (logging, list_changed) are ignored.
    }
    if (typeof msg.id === "number" && pending.has(msg.id)) {
      const entry = pending.get(msg.id)!;
      pending.delete(msg.id);
      entry.resolve(msg);
    }
  };
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf("\n");
    while (newline !== -1) {
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      handleLine(line);
      newline = stdoutBuffer.indexOf("\n");
    }
    if (stdoutBuffer.length > MAX_STDOUT_LINE_CHARS) {
      rejectAll(new HandshakeFailure("protocol-error", "MCP server wrote an oversized line to stdout"));
      stdoutBuffer = "";
    }
  });

  child.once("error", (error: NodeJS.ErrnoException) => {
    const reason = error.code === "ENOENT" ? "command not found" : error.message;
    rejectAll(new HandshakeFailure("spawn-error", `Could not start MCP server command "${launch.command}": ${reason}`));
  });
  // "close" rather than "exit": stderr is fully read by then, so the reason is complete.
  child.once("close", (code, signal) => {
    const how = signal ? `was killed by ${signal}` : `exited with code ${code}`;
    rejectAll(new HandshakeFailure("exited", `MCP server ${how} before completing the MCP handshake`));
  });

  const timer = setTimeout(() => {
    const seconds = timeoutMs / 1000;
    const shown = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
    rejectAll(new HandshakeFailure("timeout", `MCP server did not complete the handshake within ${shown}s`));
  }, timeoutMs);

  let result: McpHandshakeResult;
  try {
    const init = await request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    if (init.error !== undefined) {
      throw new HandshakeFailure("protocol-error", `MCP server rejected initialize: ${rpcErrorMessage(init.error)}`);
    }
    const initResult = init.result;
    const serverInfo = isObject(initResult) ? initResult.serverInfo : undefined;
    if (
      !isObject(initResult) ||
      !isObject(serverInfo) ||
      typeof serverInfo.name !== "string" ||
      typeof serverInfo.version !== "string"
    ) {
      throw new HandshakeFailure(
        "protocol-error",
        "MCP server sent a malformed initialize response: expected result.serverInfo with a name and a version"
      );
    }

    result = {
      ok: true,
      status: "ok",
      serverName: serverInfo.name,
      serverVersion: serverInfo.version,
      protocolVersion: typeof initResult.protocolVersion === "string" ? initResult.protocolVersion : undefined,
      ...base(),
    };

    send({ method: "notifications/initialized" });

    // Tool count is informational: the server is reachable even if this fails.
    try {
      let count = 0;
      let cursor: string | undefined;
      for (let page = 0; page < MAX_TOOLS_LIST_PAGES; page++) {
        const list = await request("tools/list", cursor ? { cursor } : {});
        if (list.error !== undefined) {
          throw new Error(`tools/list failed: ${rpcErrorMessage(list.error)}`);
        }
        if (!isObject(list.result) || !Array.isArray(list.result.tools)) {
          throw new Error("Malformed tools/list response: expected result.tools to be an array");
        }
        count += list.result.tools.length;
        cursor = typeof list.result.nextCursor === "string" ? list.result.nextCursor : undefined;
        if (!cursor) break;
      }
      result.toolCount = count;
    } catch (error) {
      result.toolsListError = redact(error instanceof Error ? error.message : String(error));
    }
    result.durationMs = Date.now() - startedAt;
  } catch (error) {
    const failure =
      error instanceof HandshakeFailure ? error : new HandshakeFailure("protocol-error", String(error));
    const exited = failure.status === "exited";
    // Redact once, before any truncation (summary, tail).
    const safeStderr = redact(stderr);
    const missingEnv = exited ? extractEnvProblems(safeStderr) : [];
    const summary = summarizeStderr(safeStderr);

    let status: Exclude<McpHandshakeStatus, "ok"> = failure.status;
    let message = failure.message;
    if (missingEnv.length > 0) {
      status = "missing-env";
      message = `MCP server refused to start: missing or invalid environment variables: ${missingEnv.join(", ")}`;
    } else if (exited && summary) {
      message = `${failure.message}: ${summary}`;
    }

    result = {
      ok: false,
      status,
      message: redact(message),
      ...(exited ? { exitCode: child.exitCode, signal: child.signalCode } : {}),
      ...(missingEnv.length > 0 ? { missingEnv } : {}),
      ...(safeStderr.trim() ? { stderrTail: tail(safeStderr, 20) } : {}),
      ...base(),
    };
  } finally {
    clearTimeout(timer);
    child.stdin?.end();
    await stopTree(child);
    child.stdout?.removeAllListeners("data");
    child.stderr?.removeAllListeners("data");
    signalSource.removeListener("SIGINT", handleSigint);
    signalSource.removeListener("SIGTERM", handleSigterm);
    signalSource.removeListener("exit", killNow);
  }

  return result;
}
