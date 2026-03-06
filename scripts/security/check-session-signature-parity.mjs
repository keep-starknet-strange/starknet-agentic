#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const USAGE_TEXT =
  "Usage: node scripts/security/check-session-signature-parity.mjs " +
  "--counterpart <name> --local-schema <path> --remote-schema <path> " +
  "--local-vectors <path> --remote-vectors <path> [--label <text>] [--vector-key <key>] [--secondary-key <key>]";

const EXIT_OK = 0;
const EXIT_PARITY_DRIFT = 1;
const EXIT_USAGE = 2;
const EXIT_RUNTIME_ERROR = 3;

export function usageAndExit(message) {
  const composedMessage = message ? `${message}\n${USAGE_TEXT}` : USAGE_TEXT;
  const error = new Error(composedMessage);
  error.name = "UsageError";
  throw error;
}

export function parseArgs(argv) {
  const args = new Map();
  const allowedFlags = new Set([
    "counterpart",
    "local-schema",
    "remote-schema",
    "local-vectors",
    "remote-vectors",
    "label",
    "vector-key",
    "secondary-key",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      usageAndExit(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!allowedFlags.has(key)) {
      usageAndExit(`Unknown flag: ${token}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      usageAndExit(`Missing value for ${token}`);
    }
    args.set(key, value);
    i += 1;
  }
  return {
    counterpart: args.get("counterpart"),
    localSchemaPath: args.get("local-schema"),
    remoteSchemaPath: args.get("remote-schema"),
    localVectorsPath: args.get("local-vectors"),
    remoteVectorsPath: args.get("remote-vectors"),
    label: args.get("label") ?? "Spec parity",
    vectorKey: args.get("vector-key") ?? "vectors",
    secondaryKey: args.get("secondary-key") ?? null,
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
  for (const [index, vector] of vectors.entries()) {
    if (typeof vector?.id !== "string" || vector.id.length === 0) {
      throw new Error("Vector without string id found while comparing parity");
    }
    if (map.has(vector.id)) {
      throw new Error(
        `Duplicate vector id found while comparing parity: ${vector.id} (index ${index} of ${vectors.length})`,
      );
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

export function main(argv = process.argv.slice(2)) {
  try {
    const parsed = parseArgs(argv);
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

    const header = `${parsed.label} vs ${parsed.counterpart}`;
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

    const localOutside = asArrayIfPresent(localVectorsDoc[parsed.vectorKey]);
    const remoteOutside = asArrayIfPresent(remoteVectorsDoc[parsed.vectorKey]);
    if (!localOutside || !remoteOutside) {
      throw new Error(
        `Both vector documents must include a top-level \`${parsed.vectorKey}\` array ` +
          `(local=${parsed.localVectorsPath}, remote=${parsed.remoteVectorsPath})`,
      );
    }
    const outsideGroup = compareVectorGroup(parsed.vectorKey, localOutside, remoteOutside);
    for (const line of outsideGroup.lines) {
      consoleLines.push(`[${parsed.counterpart}] ${line}`);
      summaryLines.push(`- ${line}`);
    }
    hasFailures = hasFailures || outsideGroup.hasIssues;

    if (parsed.secondaryKey) {
      const localSecondary = asArrayIfPresent(localVectorsDoc[parsed.secondaryKey]);
      const remoteSecondary = asArrayIfPresent(remoteVectorsDoc[parsed.secondaryKey]);
      if (!localSecondary || !remoteSecondary) {
        throw new Error(
          `Both vector documents must include a top-level \`${parsed.secondaryKey}\` array ` +
            `(local=${parsed.localVectorsPath}, remote=${parsed.remoteVectorsPath})`,
        );
      }
      const secondaryGroup = compareVectorGroup(parsed.secondaryKey, localSecondary, remoteSecondary);
      for (const line of secondaryGroup.lines) {
        consoleLines.push(`[${parsed.counterpart}] ${line}`);
        summaryLines.push(`- ${line}`);
      }
      hasFailures = hasFailures || secondaryGroup.hasIssues;
    }

    console.log(consoleLines.join("\n"));
    appendSummary(summaryLines);

    return hasFailures ? EXIT_PARITY_DRIFT : EXIT_OK;
  } catch (error) {
    if (error instanceof Error && error.name === "UsageError") {
      console.error(error.message);
      return EXIT_USAGE;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT_RUNTIME_ERROR;
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = main();
}
