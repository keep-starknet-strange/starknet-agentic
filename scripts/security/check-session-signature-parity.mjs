#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function usageAndExit(message) {
  if (message) {
    console.error(message);
  }
  console.error(
    "Usage: node scripts/security/check-session-signature-parity.mjs " +
      "--counterpart <name> --local-schema <path> --remote-schema <path> " +
      "--local-vectors <path> --remote-vectors <path>"
  );
  process.exit(2);
}

export function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      usageAndExit(`Unexpected argument: ${token}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      usageAndExit(`Missing value for ${token}`);
    }
    args.set(token.slice(2), value);
    i += 1;
  }
  return {
    counterpart: args.get("counterpart"),
    localSchemaPath: args.get("local-schema"),
    remoteSchemaPath: args.get("remote-schema"),
    localVectorsPath: args.get("local-vectors"),
    remoteVectorsPath: args.get("remote-vectors"),
  };
}

export function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function toMapById(vectors) {
  const map = new Map();
  for (const vector of vectors) {
    if (typeof vector?.id !== "string" || vector.id.length === 0) {
      throw new Error("Vector without string id found while comparing parity");
    }
    map.set(vector.id, vector);
  }
  return map;
}

export function compareVectorGroup(groupName, localVectors, remoteVectors) {
  const result = {
    missingInRemote: [],
    missingInLocal: [],
    changed: [],
  };

  const localById = toMapById(localVectors);
  const remoteById = toMapById(remoteVectors);

  for (const id of localById.keys()) {
    if (!remoteById.has(id)) {
      result.missingInRemote.push(id);
    }
  }
  for (const id of remoteById.keys()) {
    if (!localById.has(id)) {
      result.missingInLocal.push(id);
    }
  }

  const sharedIds = [...localById.keys()].filter((id) => remoteById.has(id)).sort();
  for (const id of sharedIds) {
    const localCanonical = stableStringify(localById.get(id));
    const remoteCanonical = stableStringify(remoteById.get(id));
    if (localCanonical !== remoteCanonical) {
      result.changed.push(id);
    }
  }

  const hasIssues =
    result.missingInRemote.length > 0 || result.missingInLocal.length > 0 || result.changed.length > 0;

  const lines = [];
  if (hasIssues) {
    if (result.missingInRemote.length > 0) {
      lines.push(`${groupName}: missing in counterpart -> ${result.missingInRemote.join(", ")}`);
    }
    if (result.missingInLocal.length > 0) {
      lines.push(`${groupName}: extra in counterpart -> ${result.missingInLocal.join(", ")}`);
    }
    if (result.changed.length > 0) {
      lines.push(`${groupName}: payload mismatch -> ${result.changed.join(", ")}`);
    }
  } else {
    lines.push(`${groupName}: parity OK (${localVectors.length} vectors)`);
  }

  return {
    ...result,
    hasIssues,
    lines,
  };
}

export function appendSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const content = `${lines.join("\n")}\n`;
  fs.appendFileSync(summaryPath, content, "utf8");
}

export function asArrayIfPresent(value) {
  return Array.isArray(value) ? value : null;
}

export function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (
    !parsed.counterpart ||
    !parsed.localSchemaPath ||
    !parsed.remoteSchemaPath ||
    !parsed.localVectorsPath ||
    !parsed.remoteVectorsPath
  ) {
    usageAndExit("Missing required arguments");
  }

  const localSchema = loadJson(parsed.localSchemaPath);
  const remoteSchema = loadJson(parsed.remoteSchemaPath);
  const localVectorsDoc = loadJson(parsed.localVectorsPath);
  const remoteVectorsDoc = loadJson(parsed.remoteVectorsPath);

  const header = `Session signature parity vs ${parsed.counterpart}`;
  const summaryLines = [`### ${header}`];
  const consoleLines = [`[${parsed.counterpart}] ${header}`];

  const schemaMatches = stableStringify(localSchema) === stableStringify(remoteSchema);
  if (schemaMatches) {
    consoleLines.push(`[${parsed.counterpart}] schema parity OK`);
    summaryLines.push("- schema: parity OK");
  } else {
    consoleLines.push(`[${parsed.counterpart}] schema parity mismatch`);
    summaryLines.push("- schema: MISMATCH");
  }

  let hasFailures = !schemaMatches;

  const localOutside = asArrayIfPresent(localVectorsDoc.vectors);
  const remoteOutside = asArrayIfPresent(remoteVectorsDoc.vectors);
  if (!localOutside || !remoteOutside) {
    throw new Error("Both vector documents must include a top-level `vectors` array");
  }
  const outsideGroup = compareVectorGroup("vectors", localOutside, remoteOutside);
  for (const line of outsideGroup.lines) {
    consoleLines.push(`[${parsed.counterpart}] ${line}`);
    summaryLines.push(`- ${line}`);
  }
  hasFailures = hasFailures || outsideGroup.hasIssues;

  const localSession = asArrayIfPresent(localVectorsDoc.sessionVectors);
  const remoteSession = asArrayIfPresent(remoteVectorsDoc.sessionVectors);
  if (localSession || remoteSession) {
    const effectiveLocal = localSession ?? [];
    const effectiveRemote = remoteSession ?? [];
    const sessionGroup = compareVectorGroup("sessionVectors", effectiveLocal, effectiveRemote);
    for (const line of sessionGroup.lines) {
      consoleLines.push(`[${parsed.counterpart}] ${line}`);
      summaryLines.push(`- ${line}`);
    }
    hasFailures = hasFailures || sessionGroup.hasIssues;
  }

  console.log(consoleLines.join("\n"));
  appendSummary(summaryLines);

  if (hasFailures) {
    process.exit(1);
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main();
}
