#!/usr/bin/env node
/**
 * Stand-in for `npx`: starts the script given as the first argument as a
 * child process with inherited stdio and stays alive until it exits, so tests
 * can check that the whole process tree is stopped. Writes its own pid to
 * FAKE_MCP_PID_FILE when set.
 */
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";

if (process.env.FAKE_MCP_PID_FILE) {
  appendFileSync(process.env.FAKE_MCP_PID_FILE, `${process.pid}\n`);
}

const [script, ...args] = process.argv.slice(2);
const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
