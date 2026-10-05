import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { spawnServerProcess } from "../mcp-handshake.js";

const echoArgv = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "echo-argv.mjs");

// Arguments that break naive quoting: spaces, both quote styles, cmd.exe
// metacharacters, %VAR% (expanded by cmd.exe even inside quotes), delayed
// expansion, backslashes before quotes and at the end, and an empty argument.
const TRICKY_ARGS = [
  "plain",
  "with space",
  'say "hi"',
  "single 'quotes'",
  "percent %PATH% literal",
  "%OS%",
  "amp&and|pipe<in>out",
  "caret^ and (parens)",
  "!bang! delayed",
  "back\\slash\\",
  'a\\"b',
  "C:\\Program Files\\node.exe",
  "",
  "@starknetfoundation/starknet-agentic-mcp-server@latest",
];

function runAndCollect(command: string, args: string[]): Promise<{ argv: unknown; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawnServerProcess(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        resolve({ argv: JSON.parse(stdout.trim()), stderr, code });
      } catch {
        reject(new Error(`unparsable stdout ${JSON.stringify(stdout)} (stderr: ${stderr})`));
      }
    });
  });
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe("spawnServerProcess argument round-trip", () => {
  it("delivers every argument unchanged to an executable", async () => {
    const result = await runAndCollect(process.execPath, [echoArgv, ...TRICKY_ARGS]);
    expect(result.code).toBe(0);
    expect(result.argv).toEqual(TRICKY_ARGS);
  });

  // npx/npm on Windows are .cmd shims, which only run through cmd.exe. This is
  // the path generated MCP configs (`npx -y ...`) take on Windows.
  it.runIf(process.platform === "win32")("delivers every argument unchanged through a .cmd shim", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csa-spawn-args-"));
    tempDirs.push(dir);
    const shim = path.join(dir, "echo-argv.cmd");
    fs.writeFileSync(shim, `@"${process.execPath}" "${echoArgv}" %*\r\n`);
    const result = await runAndCollect(shim, TRICKY_ARGS);
    expect(result.code).toBe(0);
    expect(result.argv).toEqual(TRICKY_ARGS);
  });
});
