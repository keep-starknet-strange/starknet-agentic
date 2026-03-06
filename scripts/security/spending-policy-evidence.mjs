#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const REPORT_SCHEMA_VERSION = "1";

const REQUIRED_CHECK_DEFINITIONS = [
  {
    id: "SP-01",
    ownerRole: "contracts",
    title: "Deploy SessionAccount to Sepolia and capture deploy tx evidence",
  },
  {
    id: "SP-02",
    ownerRole: "contracts",
    title: "Set spending policy baseline and capture policy-state evidence",
  },
  {
    id: "SP-03",
    ownerRole: "runtime",
    title: "Happy path transfers within limits validated on Sepolia",
  },
  {
    id: "SP-04",
    ownerRole: "runtime",
    title: "Per-call limit rejection validated",
  },
  {
    id: "SP-05",
    ownerRole: "runtime",
    title: "Window-limit rejection validated",
  },
  {
    id: "SP-06",
    ownerRole: "runtime",
    title: "Session key blocked from policy mutation selectors",
  },
  {
    id: "SP-07",
    ownerRole: "contracts",
    title: "Window-boundary behavior validated (reset only when now > boundary)",
  },
  {
    id: "SP-08",
    ownerRole: "runtime",
    title: "Multicall cumulative enforcement validated",
  },
  {
    id: "SP-09",
    ownerRole: "runtime",
    title: "Non-spending selector validation (counter unchanged)",
  },
  {
    id: "SP-10",
    ownerRole: "qa",
    title: "Load validation (100+ tx/hour) completed with consistency evidence",
  },
];

export const CHECK_IDS = REQUIRED_CHECK_DEFINITIONS.map((entry) => entry.id);

const ALLOWED_CHECK_STATUSES = new Set([
  "pending",
  "pass",
  "fail",
  "blocked",
  "not_applicable",
]);

const ALLOWED_SIGNOFF_STATUSES = new Set(["pending", "approved", "rejected"]);
const ALLOWED_EVIDENCE_TYPES = new Set(["tx", "log", "report", "screenshot", "other"]);
const REQUIRED_SIGNOFF_KEYS = ["leadDeveloper", "securityReviewer", "qaEngineer"];
const STRICT_ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BOOLEAN_FLAGS = new Set(["help", "init", "require-closed", "force"]);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBooleanFlag(value) {
  return value === true || value === "true";
}

function validateIsoDate(value, label) {
  if (!isNonEmptyString(value)) {
    fail(`${label} must be a non-empty ISO-8601 UTC string`);
  }
  if (!STRICT_ISO_UTC_RE.test(value)) {
    fail(`${label} must be a valid ISO-8601 UTC string (YYYY-MM-DDTHH:mm:ss.sssZ)`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} must be a valid ISO-8601 UTC string (YYYY-MM-DDTHH:mm:ss.sssZ)`);
  }
}

function defaultRunId(generatedAt) {
  const compact = generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `sp-${compact}`;
}

function toSafeRelativePath(relativePath) {
  if (!isNonEmptyString(relativePath)) {
    fail("Evidence path must be a non-empty string");
  }

  const normalized = relativePath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.includes("../")
    || normalized === ".."
    || normalized.includes("/..")
  ) {
    fail(`Evidence path must be a safe relative path: ${relativePath}`);
  }

  return normalized;
}

function resolveEvidencePath(bundleDir, relativePath) {
  const normalized = toSafeRelativePath(relativePath);
  const absoluteBase = path.resolve(bundleDir);
  const absolutePath = path.resolve(absoluteBase, normalized);
  const relative = path.relative(absoluteBase, absolutePath);
  if (
    relative.startsWith("..")
    || path.isAbsolute(relative)
    || relative === ""
  ) {
    fail(`Evidence path escapes bundle directory: ${relativePath}`);
  }

  return absolutePath;
}

function validateEvidenceEntry(entry, options) {
  const { bundleDir } = options;
  if (!isPlainObject(entry)) {
    fail("Evidence entries must be objects");
  }

  if (entry.txHash === undefined && entry.path === undefined && entry.url === undefined) {
    fail("Evidence entry must include at least one of txHash, path, or url");
  }

  if (!ALLOWED_EVIDENCE_TYPES.has(String(entry.type))) {
    fail(`Evidence type must be one of ${[...ALLOWED_EVIDENCE_TYPES].join(", ")}`);
  }

  if (entry.txHash !== undefined && !/^0x[0-9a-fA-F]+$/.test(String(entry.txHash))) {
    fail(`Evidence txHash must be a hex value: ${entry.txHash}`);
  }

  if (entry.path !== undefined) {
    if (!isNonEmptyString(entry.path)) {
      fail("Evidence path must be a non-empty string when provided");
    }
    const absolutePath = resolveEvidencePath(bundleDir, entry.path);
    if (!fs.existsSync(absolutePath)) {
      fail(`Evidence file does not exist: ${entry.path}`);
    }
  }

  if (entry.url !== undefined && !isNonEmptyString(entry.url)) {
    fail("Evidence url must be a non-empty string when provided");
  }
}

function makeDefaultOwners() {
  return {
    contracts: "contracts-maintainer",
    runtime: "runtime-maintainer",
    qa: "qa-maintainer",
  };
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      if (!BOOLEAN_FLAGS.has(name)) {
        fail(`Flag --${name} requires a value`);
      }
      args[name] = "true";
      continue;
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

export function createReportTemplate(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  validateIsoDate(generatedAt, "generatedAt");

  const runId = options.runId || defaultRunId(generatedAt);
  if (!isNonEmptyString(runId)) {
    fail("runId must be a non-empty string");
  }

  const owners = {
    ...makeDefaultOwners(),
    ...(isPlainObject(options.owners) ? options.owners : {}),
  };

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    issue: "#335",
    profile: "no-backend",
    network: options.network || "starknet-sepolia",
    runId,
    generatedAt,
    checks: REQUIRED_CHECK_DEFINITIONS.map((definition) => ({
      checkId: definition.id,
      title: definition.title,
      owner: owners[definition.ownerRole] || "unassigned",
      status: "pending",
      evidence: [],
      notes: "",
    })),
    signoff: {
      leadDeveloper: {
        name: "",
        status: "pending",
        signedAt: null,
      },
      securityReviewer: {
        name: "",
        status: "pending",
        signedAt: null,
      },
      qaEngineer: {
        name: "",
        status: "pending",
        signedAt: null,
      },
    },
    residualRisks: [],
  };
}

function validateBaseShape(report) {
  if (!isPlainObject(report)) {
    fail("Report must be a JSON object");
  }

  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${REPORT_SCHEMA_VERSION}`);
  }

  if (report.issue !== "#335") {
    fail("issue must be #335");
  }

  if (report.profile !== "no-backend") {
    fail("profile must be no-backend");
  }

  if (!isNonEmptyString(report.network)) {
    fail("network must be a non-empty string");
  }

  if (!isNonEmptyString(report.runId)) {
    fail("runId must be a non-empty string");
  }

  validateIsoDate(report.generatedAt, "generatedAt");

  if (!Array.isArray(report.checks)) {
    fail("checks must be an array");
  }

  if (!isPlainObject(report.signoff)) {
    fail("signoff must be an object");
  }

  if (!Array.isArray(report.residualRisks)) {
    fail("residualRisks must be an array");
  }
}

function validateSignoff(signoff, options) {
  const { requireClosed } = options;

  for (const key of REQUIRED_SIGNOFF_KEYS) {
    const entry = signoff[key];
    if (!isPlainObject(entry)) {
      fail(`signoff.${key} must be an object`);
    }

    if (!ALLOWED_SIGNOFF_STATUSES.has(String(entry.status))) {
      fail(`signoff.${key}.status must be one of ${[...ALLOWED_SIGNOFF_STATUSES].join(", ")}`);
    }

    if (entry.status === "approved") {
      if (!isNonEmptyString(entry.name)) {
        fail(`signoff.${key}.name must be set when approved`);
      }
      validateIsoDate(entry.signedAt, `signoff.${key}.signedAt`);
    }

    if (requireClosed && entry.status !== "approved") {
      fail(`signoff.${key}.status must be approved for closed verification`);
    }
  }
}

function validateResidualRisks(residualRisks) {
  for (const [index, entry] of residualRisks.entries()) {
    if (!isPlainObject(entry)) {
      fail(`residualRisks[${index}] must be an object`);
    }

    if (!isNonEmptyString(entry.description)) {
      fail(`residualRisks[${index}].description must be a non-empty string`);
    }

    if (!isNonEmptyString(entry.owner)) {
      fail(`residualRisks[${index}].owner must be a non-empty string`);
    }

    if (entry.dueDate !== undefined) {
      validateIsoDate(entry.dueDate, `residualRisks[${index}].dueDate`);
    }
  }
}

export function verifySpendingPolicyReport(report, options = {}) {
  const bundleDir = options.bundleDir || process.cwd();
  const requireClosed = options.requireClosed === true;

  validateBaseShape(report);

  const checkMap = new Map();
  for (const entry of report.checks) {
    if (!isPlainObject(entry)) {
      fail("checks entries must be objects");
    }

    if (!isNonEmptyString(entry.checkId)) {
      fail("checkId must be a non-empty string");
    }

    if (checkMap.has(entry.checkId)) {
      fail(`duplicate checkId: ${entry.checkId}`);
    }

    if (!ALLOWED_CHECK_STATUSES.has(String(entry.status))) {
      fail(`check ${entry.checkId} status must be one of ${[...ALLOWED_CHECK_STATUSES].join(", ")}`);
    }

    if (!isNonEmptyString(entry.owner)) {
      fail(`check ${entry.checkId} owner must be a non-empty string`);
    }

    if (!Array.isArray(entry.evidence)) {
      fail(`check ${entry.checkId} evidence must be an array`);
    }

    if (entry.status === "pass" && entry.evidence.length === 0) {
      fail("pass checks must include evidence");
    }

    for (const evidenceEntry of entry.evidence) {
      validateEvidenceEntry(evidenceEntry, { bundleDir });
    }

    checkMap.set(entry.checkId, entry);
  }

  const missingCheckIds = CHECK_IDS.filter((checkId) => !checkMap.has(checkId));
  if (missingCheckIds.length > 0) {
    fail(`missing required check ids: ${missingCheckIds.join(", ")}`);
  }

  const requiredEntries = CHECK_IDS.map((checkId) => checkMap.get(checkId));
  const passedChecks = requiredEntries.filter((entry) => entry.status === "pass").length;
  const unresolved = requiredEntries.filter((entry) => entry.status !== "pass");

  if (requireClosed && unresolved.length > 0) {
    fail(
      `closed verification requires all required checks to pass; unresolved: ${unresolved
        .map((entry) => entry.checkId)
        .join(", ")}`,
    );
  }

  validateSignoff(report.signoff, { requireClosed });
  validateResidualRisks(report.residualRisks);

  return {
    requiredChecks: CHECK_IDS.length,
    passedChecks,
    unresolvedChecks: unresolved.length,
    runId: report.runId,
  };
}

function printUsage() {
  process.stderr.write(
    "Usage: node scripts/security/spending-policy-evidence.mjs [--init] --report <path> [--bundle-dir <path>] [--require-closed] [--run-id <id>] [--generated-at <iso>] [--network <label>] [--force]\n",
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (parseBooleanFlag(args.help)) {
    printUsage();
    return 0;
  }

  const reportPath = args.report;
  if (!reportPath) {
    printUsage();
    return 2;
  }

  const absoluteReportPath = path.resolve(reportPath);
  const initMode = parseBooleanFlag(args.init);
  const requireClosed = parseBooleanFlag(args["require-closed"]);

  try {
    if (initMode) {
      const force = parseBooleanFlag(args.force);
      if (fs.existsSync(absoluteReportPath) && !force) {
        fail(`Refusing to overwrite existing report without --force: ${absoluteReportPath}`);
      }

      const report = createReportTemplate({
        runId: args["run-id"],
        generatedAt: args["generated-at"],
        network: args.network,
      });
      writeJson(absoluteReportPath, report);
      process.stdout.write(
        `spending-policy-evidence: PASS (initialized template report at ${absoluteReportPath})\n`,
      );
      return 0;
    }

    const report = readJson(absoluteReportPath);
    const bundleDir = path.resolve(args["bundle-dir"] || path.dirname(absoluteReportPath));
    const summary = verifySpendingPolicyReport(report, {
      bundleDir,
      requireClosed,
    });

    process.stdout.write(
      `spending-policy-evidence: PASS (${summary.passedChecks}/${summary.requiredChecks} required checks passed, runId=${summary.runId})\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write("spending-policy-evidence: BLOCK\n");
    process.stderr.write(`- ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  process.exitCode = main();
}
