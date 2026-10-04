import { num } from "starknet";
import type { Call } from "starknet";

export const USAGE = `Usage: node src/cli.ts --account <address> --session-key <pubkey> --call <spec> [--call <spec> ...]
                      [--expect success|revert|reject] [--reason <text>] [--control-call <spec> ...]

Signs the calls with a SessionAccount session key ([session_pubkey, r, s, valid_until],
hashed for the account's session signature mode) and checks the expected outcome.

  --call <spec>          <to>:<entrypoint>[:<felt>,<felt>,...]  e.g. 0x49d...:transfer:0xdead,500,0
                         Repeat for a multicall. <entrypoint> is the function name.
  --expect success       (default) submit, wait, require SUCCEEDED and no CallFailed event
  --expect revert        require __execute__ to revert with --reason (checked by fee
                         estimation with validation on; nothing is submitted)
  --expect reject        require __validate__ to reject the calls; --control-call must
                         validate with the same key first, so the rejection cannot be a
                         signature or session problem (nothing is submitted)

Environment:
  STARKNET_RPC           Sepolia JSON-RPC URL
  SESSION_PRIVATE_KEY    session private key (hex), never passed on the command line

Exit codes: 0 expectation met, 1 expectation not met, 2 usage or precondition error.`;

export type Expectation = "success" | "revert" | "reject";

export interface CliOptions {
  account: string;
  sessionKey: string;
  calls: Call[];
  expect: Expectation;
  reason?: string;
  controlCalls: Call[];
}

export class UsageError extends Error {
  name = "UsageError";
}

const ENTRYPOINT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseFelt(value: string, label: string): string {
  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new UsageError(`${label} is not a felt (decimal or 0x-hex): "${value}"`);
  }
  return num.toHex(BigInt(value));
}

/** Parses `<to>:<entrypoint>[:<felt>,<felt>,...]` into a starknet.js Call. */
export function parseCallSpec(spec: string): Call {
  const parts = spec.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new UsageError(`Invalid --call "${spec}"; expected <to>:<entrypoint>[:<felt>,...]`);
  }
  const [to, entrypoint, data = ""] = parts;
  // starknet.js always derives the selector with getSelectorFromName(entrypoint),
  // so a hex selector here would be hashed again and target the wrong function.
  if (!ENTRYPOINT_RE.test(entrypoint)) {
    throw new UsageError(`Invalid entrypoint "${entrypoint}"; pass the function name, not a selector`);
  }
  const calldata = data === "" ? [] : data.split(",").map((item, i) => parseFelt(item.trim(), `calldata[${i}]`));
  return { contractAddress: parseFelt(to, "call target"), entrypoint, calldata };
}

export function parseArgs(argv: string[]): CliOptions {
  let account: string | undefined;
  let sessionKey: string | undefined;
  let expect: Expectation = "success";
  let reason: string | undefined;
  const calls: Call[] = [];
  const controlCalls: Call[] = [];

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`Missing value for ${flag}`);
    }
    i++;
    switch (flag) {
      case "--account":
        account = parseFelt(value, "--account");
        break;
      case "--session-key":
        sessionKey = parseFelt(value, "--session-key");
        break;
      case "--call":
        calls.push(parseCallSpec(value));
        break;
      case "--control-call":
        controlCalls.push(parseCallSpec(value));
        break;
      case "--expect":
        if (value !== "success" && value !== "revert" && value !== "reject") {
          throw new UsageError(`--expect must be success, revert or reject, got "${value}"`);
        }
        expect = value;
        break;
      case "--reason":
        reason = value;
        break;
      default:
        throw new UsageError(`Unknown option ${flag}`);
    }
  }

  if (!account) throw new UsageError("--account is required");
  if (!sessionKey) throw new UsageError("--session-key is required");
  if (calls.length === 0) throw new UsageError("At least one --call is required");
  if (expect === "revert" && !reason) throw new UsageError("--expect revert requires --reason");
  if (expect !== "revert" && reason !== undefined) {
    throw new UsageError("--reason only applies to --expect revert");
  }
  if (expect === "reject" && controlCalls.length === 0) {
    throw new UsageError("--expect reject requires --control-call");
  }
  if (expect !== "reject" && controlCalls.length > 0) {
    throw new UsageError("--control-call only applies to --expect reject");
  }
  return { account, sessionKey, calls, expect, reason, controlCalls };
}
