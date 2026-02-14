#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SEVERITY_ORDER = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function parseArgs(argv) {
  const out = {
    report: "audit-report.json",
    allowlist: "security/audit-allowlist.json",
    failLevel: "moderate",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    out[key] = value;
    i += 1;
  }
  return out;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseGhsa(text) {
  const match = String(text).match(/GHSA-[a-z0-9-]+/i);
  return match ? match[0].toUpperCase() : null;
}

function normalizeSeverity(value) {
  const lowered = String(value || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, lowered) ? lowered : "low";
}

function extractFindings(report) {
  const findings = [];

  // pnpm format: report.advisories[id] = {...}
  if (report && typeof report.advisories === "object" && report.advisories) {
    for (const [id, adv] of Object.entries(report.advisories)) {
      const url = adv?.url || "";
      findings.push({
        id: String(id),
        ghsa: parseGhsa(url),
        pkg: adv?.module_name || adv?.name || "unknown",
        severity: normalizeSeverity(adv?.severity),
        title: adv?.title || "advisory",
        source: "pnpm",
      });
    }
  }

  // npm format: report.vulnerabilities[pkg].via[]
  if (report && typeof report.vulnerabilities === "object" && report.vulnerabilities) {
    for (const [pkgName, vuln] of Object.entries(report.vulnerabilities)) {
      const viaList = Array.isArray(vuln?.via) ? vuln.via : [];
      for (const via of viaList) {
        if (!via || typeof via !== "object") continue;
        const url = via.url || "";
        findings.push({
          id: via.source != null ? String(via.source) : null,
          ghsa: parseGhsa(url) || parseGhsa(via.title || ""),
          pkg: via.name || pkgName,
          severity: normalizeSeverity(via.severity || vuln?.severity),
          title: via.title || vuln?.title || "advisory",
          source: "npm",
        });
      }
    }
  }

  // De-duplicate.
  const dedup = new Map();
  for (const item of findings) {
    const key = `${item.id || ""}|${item.ghsa || ""}|${item.pkg}|${item.severity}|${item.title}`;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }
  return [...dedup.values()];
}

function isAllowed(finding, allowlist) {
  const byId = finding.id && allowlist.advisoryIds.has(finding.id);
  const byGhsa = finding.ghsa && allowlist.ghsaIds.has(finding.ghsa);
  const byPkg = allowlist.packages.has(finding.pkg);
  return Boolean(byId || byGhsa || byPkg);
}

function main() {
  const args = parseArgs(process.argv);
  const reportPath = path.resolve(args.report);
  const allowlistPath = path.resolve(args.allowlist);
  const failLevel = normalizeSeverity(args.failLevel);
  const failThreshold = SEVERITY_ORDER[failLevel];

  const report = loadJson(reportPath);
  const allow = loadJson(allowlistPath);

  const allowlist = {
    advisoryIds: new Set((allow.advisoryIds || []).map(String)),
    ghsaIds: new Set((allow.ghsaIds || []).map((id) => String(id).toUpperCase())),
    packages: new Set((allow.packages || []).map(String)),
  };

  const findings = extractFindings(report)
    .filter((f) => SEVERITY_ORDER[f.severity] >= failThreshold)
    .filter((f) => !isAllowed(f, allowlist));

  if (findings.length === 0) {
    console.log(
      `audit-gate: PASS (no unallowlisted advisories at severity >= ${failLevel})`,
    );
    return;
  }

  console.error(
    `audit-gate: FAIL (${findings.length} unallowlisted advisories at severity >= ${failLevel})`,
  );
  for (const item of findings) {
    console.error(
      `- [${item.severity}] pkg=${item.pkg} id=${item.id || "-"} ghsa=${item.ghsa || "-"} :: ${item.title}`,
    );
  }
  process.exit(1);
}

main();
