/**
 * Guards against generated projects drifting from the versions this workspace
 * builds and tests against. Generated projects cannot use `catalog:`, so the
 * templates carry literal ranges; this test fails when one of them no longer
 * matches the root pnpm catalog (or, for packages outside the catalog, the
 * ranges declared by the workspace's own packages).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateProject, TEMPLATE_DEPENDENCY_VERSIONS } from "../templates.js";
import type { DeFiProtocol, Network, ProjectConfig, Template } from "../types.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Reads the top-level `catalog:` map from the root pnpm-workspace.yaml. */
function readRootCatalog(): Record<string, string> {
  const yaml = readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
  const catalog: Record<string, string> = {};
  let inCatalog = false;
  for (const line of yaml.split("\n")) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (!inCatalog || /^\s*(#.*)?$/.test(line)) continue;
    if (/^\S/.test(line)) break; // next top-level key
    const match = line.match(/^\s+(['"]?)([^'"\s][^'"]*?)\1:\s*(['"]?)([^'"\s#]+)\3\s*(#.*)?$/);
    if (match) catalog[match[2]] = match[4];
  }
  return catalog;
}

/** Collects every literal range declared for each dependency by workspace packages. */
function readWorkspaceRanges(): Map<string, Set<string>> {
  const ranges = new Map<string, Set<string>>();
  for (const group of ["packages", "examples"]) {
    const groupDir = join(REPO_ROOT, group);
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      const manifestPath = join(groupDir, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const [name, range] of Object.entries<string>(manifest[field] ?? {})) {
          if (range.startsWith("catalog:") || range.startsWith("workspace:")) continue;
          if (!ranges.has(name)) ranges.set(name, new Set());
          ranges.get(name)!.add(range);
        }
      }
    }
  }
  return ranges;
}

/** package.json of every template/network/protocol combination the CLI can emit. */
function allGeneratedManifests(): Array<{ label: string; pkg: Record<string, unknown> }> {
  const templates: Template[] = ["minimal", "defi", "full"];
  const networks: Network[] = ["mainnet", "sepolia", "custom"];
  const protocolSets: DeFiProtocol[][] = [[], ["avnu"]];
  const manifests: Array<{ label: string; pkg: Record<string, unknown> }> = [];
  for (const template of templates) {
    for (const network of networks) {
      for (const defiProtocols of protocolSets) {
        const config: ProjectConfig = {
          projectName: "drift-check",
          network,
          customRpcUrl: network === "custom" ? "https://rpc.example.com" : undefined,
          template,
          defiProtocols,
          includeExample: "none",
          installDeps: false,
        };
        manifests.push({
          label: `${template}/${network}/[${defiProtocols.join(",")}]`,
          pkg: JSON.parse(generateProject(config)["package.json"]),
        });
      }
    }
  }
  return manifests;
}

function emittedDependencies(pkg: Record<string, unknown>): Array<[string, string]> {
  return ["dependencies", "devDependencies"].flatMap((field) =>
    Object.entries((pkg[field] ?? {}) as Record<string, string>)
  );
}

describe("template dependency versions", () => {
  const catalog = readRootCatalog();
  const workspaceRanges = readWorkspaceRanges();
  const manifests = allGeneratedManifests();

  it("parses the root pnpm catalog", () => {
    // Guards against the parser silently returning nothing, which would make
    // the drift checks below vacuous.
    expect(catalog.starknet).toMatch(/^\^?\d/);
    expect(catalog.typescript).toMatch(/^\^?\d/);
  });

  it("only emits ranges from TEMPLATE_DEPENDENCY_VERSIONS", () => {
    for (const { label, pkg } of manifests) {
      for (const [name, range] of emittedDependencies(pkg)) {
        expect(
          TEMPLATE_DEPENDENCY_VERSIONS[name as keyof typeof TEMPLATE_DEPENDENCY_VERSIONS],
          `${label}: ${name} is not listed in TEMPLATE_DEPENDENCY_VERSIONS`
        ).toBe(range);
      }
    }
  });

  it("emits literal semver ranges that a standalone project can install", () => {
    for (const { label, pkg } of manifests) {
      for (const [name, range] of emittedDependencies(pkg)) {
        expect(range, `${label}: ${name}`).toMatch(/^[\^~]?\d+\.\d+\.\d+$/);
      }
    }
  });

  it.each(Object.entries(TEMPLATE_DEPENDENCY_VERSIONS))(
    "%s matches the range this workspace uses",
    (name, range) => {
      if (name in catalog) {
        expect(
          range,
          `${name}: template range drifted from pnpm-workspace.yaml catalog`
        ).toBe(catalog[name]);
        return;
      }
      const declared = workspaceRanges.get(name);
      expect(
        declared,
        `${name} is neither in the root catalog nor declared by any workspace package; add it to the catalog`
      ).toBeDefined();
      expect(
        [...declared!],
        `${name}: template range drifted from the ranges workspace packages declare`
      ).toContain(range);
    }
  );
});
