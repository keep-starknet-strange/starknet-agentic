#!/usr/bin/env node
/**
 * Scaffolds every template with the built CLI (dist/index.js) into a temp
 * directory and type-checks each generated project against the dependency
 * versions it was given.
 *
 * Template versions come from the workspace catalog at build time (see
 * scripts/template-versions.ts), so a catalog bump changes generated projects
 * without anyone editing the templates. This check is what catches a bump,
 * such as a new starknet.js major, that the template code no longer compiles
 * against. CI runs it on catalog and scaffolder changes.
 *
 * Usage: pnpm --filter @starknetfoundation/create-starknet-agent check:generated [--keep]
 *   --keep  leave the generated projects on disk and print their location
 *
 * Needs network access: the CLI runs `npm install` in each generated project.
 * HOME is redirected into the temp directory so nothing touches the real home.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = ["minimal", "defi", "full"];
const NETWORK = "sepolia";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageDir, "dist", "index.js");
const keep = process.argv.includes("--keep");

if (!existsSync(cli)) {
  console.error(`Missing ${cli}. Build first: pnpm --filter @starknetfoundation/create-starknet-agent build`);
  process.exit(2);
}

const workDir = mkdtempSync(join(tmpdir(), "csa-generated-"));
const home = join(workDir, "home");
mkdirSync(home);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HOME: home, CI: "true" },
  });
  return result.status === 0;
}

const failures = [];
for (const template of TEMPLATES) {
  const name = `sample-${template}`;
  const projectDir = join(workDir, name);

  console.log(`\n=== ${template}: scaffold (${NETWORK}, standalone)`);
  const scaffolded = run(
    process.execPath,
    [cli, name, "--template", template, "--network", NETWORK, "--platform", "standalone", "--non-interactive"],
    workDir
  );
  if (!scaffolded || !existsSync(join(projectDir, "package.json"))) {
    failures.push(`${template}: scaffold`);
    continue;
  }

  // The CLI installs dependencies itself; install here only if it skipped that.
  if (!existsSync(join(projectDir, "node_modules")) && !run("npm", ["install", "--no-audit", "--no-fund"], projectDir)) {
    failures.push(`${template}: npm install`);
    continue;
  }

  console.log(`=== ${template}: type-check`);
  if (!run("npx", ["--no-install", "tsc", "--noEmit", "-p", "."], projectDir)) {
    failures.push(`${template}: tsc --noEmit`);
  }
}

if (keep) {
  console.log(`\nGenerated projects kept in ${workDir}`);
} else {
  rmSync(workDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nGenerated-project check failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nAll ${TEMPLATES.length} templates scaffold and type-check.`);
