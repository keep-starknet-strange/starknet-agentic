import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CHECK_IDS,
  createReportTemplate,
  main,
  parseArgs,
  verifySpendingPolicyReport,
} from "./spending-policy-evidence.mjs";

const TEST_TX_URL = "https://example.invalid/tx/0x1";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spending-policy-evidence-"));
}

function makeClosedReport(bundleDir) {
  const evidencePath = "logs/spending-policy-run.log";
  const evidenceFile = path.join(bundleDir, evidencePath);
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
  fs.writeFileSync(evidenceFile, "ok\n", "utf8");

  return {
    schemaVersion: "1",
    issue: "#335",
    profile: "no-backend",
    network: "starknet-sepolia",
    runId: "sp-closed-1",
    generatedAt: "2026-03-06T00:00:00.000Z",
    checks: CHECK_IDS.map((checkId, index) => ({
      checkId,
      title: `Title ${index + 1}`,
      owner: "contracts-maintainer",
      status: "pass",
      evidence: [
        {
          type: "tx",
          txHash: `0x${(index + 1).toString(16).padStart(4, "0")}`,
          url: TEST_TX_URL,
        },
        {
          type: "log",
          path: evidencePath,
        },
      ],
      notes: "validated",
    })),
    signoff: {
      leadDeveloper: {
        name: "Lead Dev",
        status: "approved",
        signedAt: "2026-03-06T00:01:00.000Z",
      },
      securityReviewer: {
        name: "Security Reviewer",
        status: "approved",
        signedAt: "2026-03-06T00:02:00.000Z",
      },
      qaEngineer: {
        name: "QA Engineer",
        status: "approved",
        signedAt: "2026-03-06T00:03:00.000Z",
      },
    },
    residualRisks: [],
  };
}

function writeTempReport(report) {
  const tempDir = makeTempDir();
  const reportPath = path.join(tempDir, "execution-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { tempDir, reportPath };
}

test("parseArgs parses flags and values", () => {
  const args = parseArgs(["--report", "report.json", "--require-closed", "--bundle-dir", "out"]);
  assert.equal(args.report, "report.json");
  assert.equal(args["require-closed"], "true");
  assert.equal(args["bundle-dir"], "out");
});

test("parseArgs rejects missing values for value-bearing flags", () => {
  assert.throws(
    () => parseArgs(["--report", "--require-closed"]),
    /Flag --report requires a value/i,
  );
  assert.throws(
    () => parseArgs(["--bundle-dir"]),
    /Flag --bundle-dir requires a value/i,
  );
});

test("createReportTemplate includes all required checks with pending status", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  assert.equal(report.runId, "sp-test");
  assert.equal(report.checks.length, CHECK_IDS.length);
  for (const check of report.checks) {
    assert.equal(check.status, "pending");
  }
});

test("createReportTemplate rejects non-ISO UTC generatedAt formats", () => {
  assert.throws(
    () => createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06" }),
    /ISO-8601 UTC/i,
  );
  assert.throws(
    () => createReportTemplate({ runId: "sp-test", generatedAt: "March 6, 2026" }),
    /ISO-8601 UTC/i,
  );
});

test("verifySpendingPolicyReport fails when a required check is missing", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks = report.checks.filter((entry) => entry.checkId !== CHECK_IDS[0]);

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir: process.cwd() }),
    /missing required check ids/i,
  );
});

test("verifySpendingPolicyReport fails when a pass check has no evidence", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks = report.checks.map((entry, index) =>
    index === 0
      ? { ...entry, status: "pass", evidence: [] }
      : entry,
  );

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir: process.cwd() }),
    /pass checks must include evidence/i,
  );
});

test("verifySpendingPolicyReport rejects path traversal in evidence paths", (t) => {
  const bundleDir = makeTempDir();
  t.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks = report.checks.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          status: "pass",
          evidence: [
            {
              type: "log",
              path: "../outside.log",
            },
          ],
        }
      : entry,
  );

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir }),
    /safe relative path/i,
  );
});

test("verifySpendingPolicyReport rejects Windows absolute evidence paths", (t) => {
  const bundleDir = makeTempDir();
  t.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks = report.checks.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          status: "pass",
          evidence: [
            {
              type: "log",
              path: "C:\\windows\\system32\\proof.log",
            },
          ],
        }
      : entry,
  );

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir }),
    /safe relative path/i,
  );
});

test("verifySpendingPolicyReport fails on duplicate checkId", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks.push({ ...report.checks[0] });

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir: process.cwd() }),
    /duplicate checkId/i,
  );
});

test("verifySpendingPolicyReport rejects non-string evidence url", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks = report.checks.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          status: "pass",
          evidence: [
            {
              type: "tx",
              txHash: "0x1",
              url: null,
            },
          ],
        }
      : entry,
  );

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir: process.cwd() }),
    /evidence url must be a non-empty string/i,
  );
});

test("verifySpendingPolicyReport rejects evidence entries without locator", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.checks = report.checks.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          status: "pass",
          evidence: [
            {
              type: "other",
            },
          ],
        }
      : entry,
  );

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir: process.cwd() }),
    /must include at least one of txHash, path, or url/i,
  );
});

test("verifySpendingPolicyReport rejects empty residual risks entries", () => {
  const report = createReportTemplate({ runId: "sp-test", generatedAt: "2026-03-06T00:00:00.000Z" });
  report.residualRisks = [{}];

  assert.throws(
    () => verifySpendingPolicyReport(report, { bundleDir: process.cwd() }),
    /residualRisks\[0\]\.description must be a non-empty string/i,
  );
});

test("verifySpendingPolicyReport passes for closed report", (t) => {
  const bundleDir = makeTempDir();
  t.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));

  const report = makeClosedReport(bundleDir);
  const summary = verifySpendingPolicyReport(report, {
    bundleDir,
    requireClosed: true,
  });

  assert.equal(summary.requiredChecks, CHECK_IDS.length);
  assert.equal(summary.passedChecks, CHECK_IDS.length);
});

test("main initializes template report", (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const reportPath = path.join(tempDir, "execution-report.json");
  const exitCode = main([
    "--init",
    "--report",
    reportPath,
    "--run-id",
    "sp-init",
    "--generated-at",
    "2026-03-06T00:00:00.000Z",
  ]);

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(parsed.runId, "sp-init");
});

test("main returns 1 for non-closed report when --require-closed is set", (t) => {
  const report = createReportTemplate({ runId: "sp-open", generatedAt: "2026-03-06T00:00:00.000Z" });
  const { tempDir, reportPath } = writeTempReport(report);
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const exitCode = main([
    "--report",
    reportPath,
    "--bundle-dir",
    tempDir,
    "--require-closed",
  ]);

  assert.equal(exitCode, 1);
});
