import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRootFromThisFile(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // packages/create-starknet-agent/src/__tests__ -> repo root
  return path.resolve(__dirname, "../../../..");
}

describe("controller-cli skill acceptance", () => {
  const repoRoot = repoRootFromThisFile();
  const wrapper = path.join(
    repoRoot,
    "skills",
    "controller-cli",
    "scripts",
    "controller_safe.py"
  );
  const validator = path.join(
    repoRoot,
    "skills",
    "controller-cli",
    "scripts",
    "validate_hex_address.py"
  );

  it("appends --json and returns parsed JSON output", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "controller-cli-skill-"));
    const calledFile = path.join(tmp, "called.txt");
    const stubController = path.join(tmp, "controller");

    fs.writeFileSync(
      stubController,
      `#!/usr/bin/env python3
import json, os, sys
called = os.environ.get("CALLED_FILE")
if called:
  with open(called, "w", encoding="utf-8") as f:
    f.write(" ".join(sys.argv[1:]))

if "--json" not in sys.argv[1:]:
  sys.stdout.write("NOT_JSON")
  raise SystemExit(0)

json.dump({"status": "success", "argv": sys.argv[1:]}, sys.stdout)
`,
      { encoding: "utf-8" }
    );
    fs.chmodSync(stubController, 0o755);

    const res = spawnSync("python3", [wrapper, "status"], {
      env: {
        ...process.env,
        PATH: `${tmp}:${process.env.PATH ?? ""}`,
        CALLED_FILE: calledFile,
      },
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");

    const payload = JSON.parse(res.stdout);
    expect(payload.status).toBe("success");
    expect(fs.readFileSync(calledFile, "utf-8")).toContain("--json");
  });

  it("refuses execute without explicit network and does not invoke controller", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "controller-cli-skill-"));
    const calledFile = path.join(tmp, "called.txt");
    const stubController = path.join(tmp, "controller");

    fs.writeFileSync(
      stubController,
      `#!/usr/bin/env python3
import os
called = os.environ.get("CALLED_FILE")
if called:
  with open(called, "w", encoding="utf-8") as f:
    f.write("CALLED")
`,
      { encoding: "utf-8" }
    );
    fs.chmodSync(stubController, 0o755);

    const res = spawnSync(
      "python3",
      [wrapper, "execute", "0xabc", "transfer", "0x1"],
      {
        env: {
          ...process.env,
          PATH: `${tmp}:${process.env.PATH ?? ""}`,
          CALLED_FILE: calledFile,
        },
        encoding: "utf-8",
      }
    );

    expect(res.status).toBe(2);
    expect(res.stderr).toContain("requires explicit network");
    expect(fs.existsSync(calledFile)).toBe(false);
  });

  it("exits non-zero on JSON error payload (no stubbed success)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "controller-cli-skill-"));
    const stubController = path.join(tmp, "controller");

    fs.writeFileSync(
      stubController,
      `#!/usr/bin/env python3
import json, sys
json.dump({
  "status": "error",
  "error_code": "NoSession",
  "message": "No keypair found",
  "recovery_hint": "Run controller generate --json"
}, sys.stdout)
`,
      { encoding: "utf-8" }
    );
    fs.chmodSync(stubController, 0o755);

    const res = spawnSync("python3", [wrapper, "status"], {
      env: { ...process.env, PATH: `${tmp}:${process.env.PATH ?? ""}` },
      encoding: "utf-8",
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("controller error: NoSession");
  });

  it("allows networked calls when --chain-id is provided", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "controller-cli-skill-"));
    const calledFile = path.join(tmp, "called.txt");
    const stubController = path.join(tmp, "controller");

    fs.writeFileSync(
      stubController,
      `#!/usr/bin/env python3
import json, os, sys
called = os.environ.get("CALLED_FILE")
if called:
  with open(called, "w", encoding="utf-8") as f:
    f.write(" ".join(sys.argv[1:]))
json.dump({"status": "success"}, sys.stdout)
`,
      { encoding: "utf-8" }
    );
    fs.chmodSync(stubController, 0o755);

    const res = spawnSync(
      "python3",
      [wrapper, "call", "0x1", "balance_of", "0x2", "--chain-id", "SN_SEPOLIA"],
      {
        env: {
          ...process.env,
          PATH: `${tmp}:${process.env.PATH ?? ""}`,
          CALLED_FILE: calledFile,
        },
        encoding: "utf-8",
      }
    );

    expect(res.status).toBe(0);
    expect(fs.readFileSync(calledFile, "utf-8")).toContain("--chain-id SN_SEPOLIA");
    expect(fs.readFileSync(calledFile, "utf-8")).toContain("--json");
  });

  it("validate_hex_address rejects overly long values", () => {
    const tooLong = `0x${"1".repeat(65)}`; // 0x + 65 hex chars
    const res = spawnSync("python3", [validator, tooLong], { encoding: "utf-8" });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("too long");
  });

  it("validate_hex_address accepts common 0x + 64-hex addresses", () => {
    const padded = `0x${"0".repeat(63)}1`; // length = 66
    const res = spawnSync("python3", [validator, padded], { encoding: "utf-8" });

    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  });
});
