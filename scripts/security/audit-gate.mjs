#!/usr/bin/env node

import fs from "node:fs";

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[name] = "true";
      continue;
    }
    args[name] = value;
    i += 1;
  }
  return args;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function normalizeSeverity(value) {
  return String(value || "info").toLowerCase();
}

function advisoryIdFromVia(via) {
  if (typeof via === "string") return via;
  if (!via || typeof via !== "object") return "unknown";
  if (via.source !== undefined && via.source !== null) return String(via.source);
  if (via.url) return String(via.url);
  if (via.title) return String(via.title);
  return "unknown";
}

function collectFromV2Report(report) {
  const findings = [];
  const advisories = report?.advisories || {};
  for (const [id, advisory] of Object.entries(advisories)) {
    findings.push({
      id: String(id),
      package: advisory?.module_name || "unknown",
      severity: normalizeSeverity(advisory?.severity),
      title: advisory?.title || advisory?.url || "advisory",
    });
  }
  return findings;
}

function collectFromV3Report(report) {
  const findings = [];
  const vulnerabilities = report?.vulnerabilities || {};
  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const fallbackSeverity = normalizeSeverity(vuln?.severity);
    const viaList = Array.isArray(vuln?.via) ? vuln.via : [];
    if (viaList.length === 0) {
      findings.push({
        id: `${pkgName}:${fallbackSeverity}`,
        package: pkgName,
        severity: fallbackSeverity,
        title: "vulnerability",
      });
      continue;
    }
    for (const via of viaList) {
      const sev = normalizeSeverity(
        typeof via === "object" ? via?.severity : fallbackSeverity,
      );
      const id = advisoryIdFromVia(via);
      findings.push({
        id,
        package: pkgName,
        severity: sev,
        title:
          typeof via === "object"
            ? via?.title || via?.name || via?.url || "vulnerability"
            : String(via),
      });
    }
  }
  return findings;
}

function collectFindings(report) {
  const byKey = new Map();
  const raw = [];

  if (report?.vulnerabilities) {
    raw.push(...collectFromV3Report(report));
  }
  if (report?.advisories) {
    raw.push(...collectFromV2Report(report));
  }

  for (const finding of raw) {
    const key = `${finding.id}|${finding.package}|${finding.severity}`;
    if (!byKey.has(key)) byKey.set(key, finding);
  }
  return [...byKey.values()];
}

function isExpired(entry) {
  if (!entry?.expiresOn) return false;
  const expires = new Date(entry.expiresOn);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() < Date.now();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = args.report;
  const allowlistPath = args.allowlist;
  const failLevel = normalizeSeverity(args.failLevel || "high");

  if (!reportPath || !allowlistPath) {
    console.error(
      "Usage: node scripts/security/audit-gate.mjs --report <path> --allowlist <path> [--failLevel low|moderate|high|critical]",
    );
    process.exit(2);
  }

  const threshold = SEVERITY_RANK[failLevel];
  if (threshold === undefined) {
    console.error(`Invalid --failLevel: ${failLevel}`);
    process.exit(2);
  }

  const report = readJson(reportPath);
  const allowlistDoc = readJson(allowlistPath);
  const allowlistEntries = Array.isArray(allowlistDoc?.advisories)
    ? allowlistDoc.advisories
    : [];

  const allowById = new Map(
    allowlistEntries.map((entry) => [String(entry.id), entry]),
  );

  const findings = collectFindings(report).filter(
    (finding) => (SEVERITY_RANK[finding.severity] ?? 0) >= threshold,
  );

  const blocking = [];
  for (const finding of findings) {
    const allow = allowById.get(String(finding.id));
    if (!allow) {
      blocking.push({ finding, reason: "not allowlisted" });
      continue;
    }
    if (isExpired(allow)) {
      blocking.push({ finding, reason: "allowlist expired" });
    }
  }

  if (blocking.length > 0) {
    console.error("audit-gate: BLOCK");
    for (const item of blocking) {
      const { finding, reason } = item;
      console.error(
        `- [${finding.severity}] ${finding.id} (${finding.package}) - ${finding.title} [${reason}]`,
      );
    }
    process.exit(1);
  }

  console.log(
    `audit-gate: PASS (${findings.length} findings at or above ${failLevel}, all allowlisted)`,
  );
}

main();
