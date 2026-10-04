#!/usr/bin/env node
// Checks that every root `pnpm.overrides` entry has a row in the override
// register (docs/security/DEPENDENCY_EXCEPTION_REGISTER.md) and that every
// register row still matches an override.
//
// Fails (exit 1) when:
//   - an override has no register row, or a row has no override
//   - a row is duplicated or malformed (missing selector / review-by date)
// Warns (exit 0) when:
//   - a row's review-by date has passed
//   - a row's pinned target differs from the value in package.json
//
// Dependency-free on purpose so it runs before `pnpm install`.
//
// Usage: node scripts/check-overrides.mjs [--package package.json]
//          [--register docs/security/DEPENDENCY_EXCEPTION_REGISTER.md]
//          [--today YYYY-MM-DD]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START_MARKER = "<!-- override-register:start -->";
const END_MARKER = "<!-- override-register:end -->";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IN_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key.slice(2)] = "true";
      continue;
    }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function stripCode(cell) {
  const match = /^`([^`]+)`$/.exec(cell.trim());
  return match ? match[1] : null;
}

function splitRow(line) {
  // Drop the leading and trailing pipe, then split on unescaped pipes.
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

export function parseRegister(markdown) {
  const start = markdown.indexOf(START_MARKER);
  const end = markdown.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`register table markers not found (${START_MARKER} ... ${END_MARKER})`);
  }
  const lines = markdown
    .slice(start + START_MARKER.length, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) throw new Error("register table is empty");

  const header = splitRow(lines[0]).map((cell) => cell.toLowerCase());
  const col = (name) => header.findIndex((cell) => cell.startsWith(name));
  const selectorCol = col("selector");
  const targetCol = col("target");
  const reviewCol = col("review by");
  if (selectorCol === -1 || targetCol === -1 || reviewCol === -1) {
    throw new Error("register table must have 'Selector', 'Target' and 'Review by' columns");
  }

  return lines.slice(2).map((line, index) => {
    const cells = splitRow(line);
    return {
      line: index + 1,
      selector: stripCode(cells[selectorCol] ?? ""),
      rawSelector: cells[selectorCol] ?? "",
      target: stripCode(cells[targetCol] ?? ""),
      rawTarget: cells[targetCol] ?? "",
      reviewBy: (cells[reviewCol] ?? "").replace(/`/g, ""),
    };
  });
}

export function checkOverrides({ overrides, rows, today }) {
  const errors = [];
  const warnings = [];
  const seen = new Map();

  for (const row of rows) {
    if (!row.selector) {
      errors.push(`register row ${row.line}: selector must be a single code span, got "${row.rawSelector}"`);
      continue;
    }
    if (seen.has(row.selector)) {
      errors.push(`register lists "${row.selector}" more than once`);
      continue;
    }
    seen.set(row.selector, row);

    if (!Object.hasOwn(overrides, row.selector)) {
      errors.push(`register row "${row.selector}" has no matching pnpm.overrides entry (remove the row or restore the override)`);
      continue;
    }
    if (!DATE_RE.test(row.reviewBy) || Number.isNaN(Date.parse(row.reviewBy))) {
      errors.push(`register row "${row.selector}": review-by date "${row.reviewBy}" is not YYYY-MM-DD`);
    } else if (row.reviewBy < today) {
      warnings.push(`override "${row.selector}" was due for review on ${row.reviewBy}; re-check whether it is still needed`);
    }
    if (row.target !== overrides[row.selector]) {
      warnings.push(`override "${row.selector}" is "${overrides[row.selector]}" in package.json but "${row.target ?? row.rawTarget}" in the register`);
    }
  }

  for (const selector of Object.keys(overrides)) {
    if (!seen.has(selector)) {
      errors.push(`pnpm.overrides entry "${selector}" has no row in the register`);
    }
  }
  return { errors, warnings };
}

function report(level, message) {
  if (IN_GITHUB_ACTIONS) {
    console.log(`::${level}::${message}`);
  } else {
    console.log(`${level.toUpperCase()}: ${message}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packagePath = path.resolve(ROOT, args.package ?? "package.json");
  const registerPath = path.resolve(ROOT, args.register ?? "docs/security/DEPENDENCY_EXCEPTION_REGISTER.md");
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(today)) {
    console.error(`--today must be YYYY-MM-DD, got "${today}"`);
    process.exit(2);
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const overrides = pkg.pnpm?.overrides ?? {};
  const rows = parseRegister(fs.readFileSync(registerPath, "utf8"));
  const { errors, warnings } = checkOverrides({ overrides, rows, today });

  for (const warning of warnings) report("warning", warning);
  for (const error of errors) report("error", error);

  const summary = `${Object.keys(overrides).length} overrides, ${rows.length} register rows, ${errors.length} error(s), ${warnings.length} warning(s)`;
  if (errors.length > 0) {
    console.log(`Override register check failed: ${summary}`);
    process.exit(1);
  }
  console.log(`Override register check passed: ${summary}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    report("error", error.message);
    process.exit(1);
  }
}
